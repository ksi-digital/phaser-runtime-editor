import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'PhaserRuntimeEditor',
            formats: ['es', 'cjs'],
            fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`
        },
        rollupOptions: {
            external: ['phaser'],
            output: {
                globals: { phaser: 'Phaser' }
            }
        },
        sourcemap: true
    },
    plugins: [dts({ rollupTypes: true })]
});
