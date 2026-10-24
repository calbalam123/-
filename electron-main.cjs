const { app, BrowserWindow, dialog } = require('electron');

const PORT = 4000;

async function start() {
  process.env.PORT = String(PORT);
  // Keep the database in the user's writable application-data folder,
  // not inside the installed program directory.
  process.chdir(app.getPath('userData'));

  try {
    // Importing the existing Express app starts its local server.
    await import('./server.js');

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 760,
      minHeight: 600,
      title: '마르스 경제봇',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    await win.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    console.error(error);
    dialog.showErrorBox(
      '마르스 경제봇 실행 오류',
      '프로그램을 시작하지 못했습니다.\n\n' + (error?.stack || error)
    );
    app.quit();
  }
}

app.whenReady().then(start);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
