import admin from 'firebase-admin';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

let firestore: admin.firestore.Firestore | null = null;

export function initFirebase() {
    try {
        if (!config.GOOGLE_APPLICATION_CREDENTIALS) {
            console.warn('⚠️ GOOGLE_APPLICATION_CREDENTIALS no configurado. Firebase no se activará.');
            return;
        }

        // Limpiar posibles comillas y resolver ruta absoluta
        const rawPath = config.GOOGLE_APPLICATION_CREDENTIALS.replace(/['"]/g, '');
        const absolutePath = path.resolve(process.cwd(), rawPath);

        if (!fs.existsSync(absolutePath)) {
            console.warn(`⚠️ Archivo de credenciales no encontrado en: ${absolutePath}. Firebase no se activará.`);
            return;
        }

        admin.initializeApp({
            credential: admin.credential.cert(absolutePath)
        });

        firestore = admin.firestore();
        firestore.settings({ ignoreUndefinedProperties: true });
        console.log('✅ Firebase Firestore inicializado con éxito.');
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
    }
}

export const firebaseMemory = {
    saveMessage: async (userId: number, message: any, wait: boolean = false) => {
        if (!firestore) return;
        try {
            console.log(`📡 Intentando sincronizar respuesta (${message.role}) con Firebase para usuario ${userId}...`);
            const userHistoryRef = firestore.collection('conversations').doc(userId.toString()).collection('messages');
            const dataToSave = {
                ...message,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            };
            
            const promise = userHistoryRef.add(dataToSave);
            
            if (wait) {
                await promise;
                console.log(`✅ Sincronización exitosa con Firebase para rol: ${message.role}`);
            }
        } catch (error) {
            console.error('❌ Error guardando en Firebase:', error);
        }
    },

    clearHistory: async (userId: number) => {
        if (!firestore) return;
        try {
            const messagesRef = firestore.collection('conversations').doc(userId.toString()).collection('messages');
            const snapshot = await messagesRef.get();
            const batch = firestore.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`Historial de Firebase borrado para usuario ${userId}`);
        } catch (error) {
            console.error('Error borrando historial en Firebase:', error);
        }
    }
};
