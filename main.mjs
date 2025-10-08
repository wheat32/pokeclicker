import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';

app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch(
    'enable-features',
    'WaylandWindowDecorations,UseOzonePlatform,WebRTCPipeWireCapturer'
);

function createWindow() {
    const statePath = path.join(app.getPath('userData'), 'window-state.json');

    function loadState() {
        try {
            return JSON.parse(fs.readFileSync(statePath, 'utf8'));
        } catch {
            return { width: 1280, height: 800, isMaximized: false };
        }
    }

    const state = loadState();

    let lastUnminimized = {
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
    };

    function saveState(win) {
        // Use the last known unminimized geometry if minimized or maximized
        const usingBounds =
            !win.isMinimized() && !win.isMaximized()
                ? win.getBounds()
                : lastUnminimized;

        const bounds = {
            ...usingBounds,
            isMaximized: win.isMaximized(),
        };

        if (!isWayland) {
            const displays = screen.getAllDisplays();
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            const display = displays.find(
                d =>
                    cx >= d.bounds.x &&
                    cx < d.bounds.x + d.bounds.width &&
                    cy >= d.bounds.y &&
                    cy < d.bounds.y + d.bounds.height
            );
            if (display) bounds.displayId = display.id;
        }

        try {
            fs.writeFileSync(statePath, JSON.stringify(bounds, null, 2));
        } catch (err) {
            console.warn('Could not save window state:', err);
        }
    }

    const winOptions = {
        width: state.width,
        height: state.height,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'src/assets/images/Pokeball.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    };

    if (!isWayland && state.displayId !== undefined) {
        const display = screen.getAllDisplays().find(d => d.id === state.displayId);
        if (display && typeof state.x === 'number' && typeof state.y === 'number') {
            winOptions.x = state.x;
            winOptions.y = state.y;
        } else if (display) {
            winOptions.x = display.bounds.x + 50;
            winOptions.y = display.bounds.y + 50;
        }
    }

    const win = new BrowserWindow(winOptions);

    if (state.isMaximized)
        win.maximize();

    // Unified tracking function
    const updateLastUnminimized = () => {
        if (!win.isMinimized() && !win.isMaximized()) {
            const b = win.getBounds();
            lastUnminimized = { ...b };
        }
    };

    // Track geometry changes
    win.on('resize', updateLastUnminimized);
    win.on('move', updateLastUnminimized);
    win.on('moved', updateLastUnminimized); // For Wayland (Electron 36+)
    win.on('restore', () => {
        if (lastUnminimized.width && lastUnminimized.height) {
            win.setSize(lastUnminimized.width, lastUnminimized.height);
            if (
                typeof lastUnminimized.x === 'number' &&
                typeof lastUnminimized.y === 'number'
            ) {
                win.setPosition(lastUnminimized.x, lastUnminimized.y);
            }
        }
    });

    win.on('close', () => saveState(win));
    win.loadFile(path.join(__dirname, 'build/index.html'));
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
