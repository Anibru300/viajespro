/**
 * 3P VIAJESPRO - Módulo de Storage v6.0
 * Manejo de imágenes en Firebase Storage
 */

import { storage } from '../firebase-config.js';
import { 
    ref, 
    uploadString, 
    getDownloadURL, 
    deleteObject,
    uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

class StorageService {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    }

    /**
     * Comprime una imagen antes de subirla
     * @param {string} base64Image - Imagen en base64
     * @param {number} maxSizeKB - Tamaño máximo en KB
     * @returns {Promise<string>} - Imagen comprimida en base64
     */
    async compressImage(base64Image, maxSizeKB = 800) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Image;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                
                // Redimensionar si es muy grande
                const maxDimension = 1920;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Calcular calidad necesaria
                let quality = 0.85;
                let compressed = canvas.toDataURL('image/jpeg', quality);
                
                // Ajustar calidad si sigue siendo muy grande
                const sizeKB = Math.round((compressed.length * 3) / 4 / 1024);
                if (sizeKB > maxSizeKB) {
                    quality = Math.max(0.5, maxSizeKB / sizeKB);
                    compressed = canvas.toDataURL('image/jpeg', quality);
                }
                
                resolve(compressed);
            };
            
            img.onerror = () => reject(new Error('Error al cargar imagen'));
        });
    }

    /**
     * Sube una imagen a Firebase Storage
     * @param {string} base64Image - Imagen en base64
     * @param {string} path - Ruta (ej: 'gastos/user123/gasto456')
     * @param {function} onProgress - Callback de progreso (0-100)
     * @returns {Promise<string>} - URL de descarga
     */
    async uploadImage(base64Image, path, onProgress = null) {
        try {
            // Validar tamaño
            const sizeInBytes = (base64Image.length * 3) / 4;
            if (sizeInBytes > this.maxFileSize) {
                throw new Error(`Imagen muy grande. Máximo ${this.maxFileSize / 1024 / 1024}MB`);
            }

            // Comprimir antes de subir
            const compressed = await this.compressImage(base64Image, 800);
            
            // Crear referencia
            const storageRef = ref(storage, `viajespro/${path}_${Date.now()}.jpg`);
            
            // Subir con monitoreo de progreso
            if (onProgress) {
                const metadata = {
                    contentType: 'image/jpeg',
                    customMetadata: {
                        uploadedBy: 'viajespro-app',
                        timestamp: new Date().toISOString()
                    }
                };
                
                const uploadTask = uploadString(storageRef, compressed, 'data_url', metadata);
                
                // Nota: uploadString no tiene progreso, usar uploadBytesResumable para eso
                // Pero requiere convertir base64 a blob primero
            }
            
            // Subir imagen
            await uploadString(storageRef, compressed, 'data_url');
            
            // Obtener URL
            const downloadURL = await getDownloadURL(storageRef);
            
            return {
                url: downloadURL,
                path: storageRef.fullPath,
                size: Math.round((compressed.length * 3) / 4 / 1024) // KB
            };
        } catch (error) {
            console.error('Error subiendo imagen:', error);
            throw error;
        }
    }

    /**
     * Sube múltiples imágenes
     * @param {Array<string>} imagesArray - Array de imágenes en base64
     * @param {string} basePath - Ruta base
     * @param {function} onProgress - Callback (current, total)
     * @returns {Promise<Array<{url, path, size}>>}
     */
    async uploadMultipleImages(imagesArray, basePath, onProgress = null) {
        const results = [];
        
        for (let i = 0; i < imagesArray.length; i++) {
            try {
                const result = await this.uploadImage(
                    imagesArray[i], 
                    `${basePath}/img${i + 1}`
                );
                results.push(result);
                
                if (onProgress) {
                    onProgress(i + 1, imagesArray.length);
                }
            } catch (error) {
                console.error(`Error subiendo imagen ${i + 1}:`, error);
                // Continuar con las demás imágenes
            }
        }
        
        return results;
    }

    /**
     * Elimina una imagen de Storage
     * @param {string} imagePath - Path completo en Storage
     */
    async deleteImage(imagePath) {
        try {
            const imageRef = ref(storage, imagePath);
            await deleteObject(imageRef);
            return { success: true };
        } catch (error) {
            console.error('Error eliminando imagen:', error);
            throw error;
        }
    }

    /**
     * Elimina múltiples imágenes
     * @param {Array<string>} imagePaths - Array de paths
     */
    async deleteMultipleImages(imagePaths) {
        const promises = imagePaths.map(path => 
            this.deleteImage(path).catch(err => ({ error: err, path }))
        );
        
        return Promise.all(promises);
    }

    /**
     * Convierte un archivo a base64
     * @param {File} file - Archivo del input file
     * @returns {Promise<string>} - Base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!this.allowedTypes.includes(file.type)) {
                reject(new Error('Tipo de archivo no válido. Solo JPG, PNG o WebP'));
                return;
            }
            
            if (file.size > this.maxFileSize) {
                reject(new Error(`Archivo muy grande. Máximo ${this.maxFileSize / 1024 / 1024}MB`));
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Error leyendo archivo'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Obtiene thumbnails de imágenes (versión pequeña para lista)
     * @param {string} base64Image - Imagen original
     * @param {number} maxSize - Tamaño máximo en píxeles
     * @returns {Promise<string>} - Thumbnail en base64
     */
    async generateThumbnail(base64Image, maxSize = 150) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Image;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                
                if (width > height) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                } else {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            
            img.onerror = () => reject(new Error('Error generando thumbnail'));
        });
    }
}

// Singleton
const storageService = new StorageService();
export default storageService;
