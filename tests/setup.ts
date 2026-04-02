import { beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';

// Set environment variable to point to a test database BEFORE any app code is imported
process.env.DB_PATH = './memory_test.db';
process.env.INSTANCE_ID = 'test';

import * as dbManager from '../src/memory/db.js';

beforeAll(() => {
  // Inicializamos la BD aquí si fuera necesario
  dbManager.initDB();
});

afterAll(() => {
  // En Windows no podemos hacer unlink (borrar) un archivo que SQLite tiene abierto
  // El archivo quedará como memory_test.db y lo limpiamos vaciando tablas en cada test.
});
