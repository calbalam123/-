const { app, BrowserWindow, dialog } = require('electron');

const PORT = 4000;

async function start() {
  process.env.PORT = String(PORT);
  process.chdir(app.getPath('userData'));

  try {
    await import('./server.js');
    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 760,
      minHeight: 600,
      title: '파인봇',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await win.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('파인봇 실행 오류', '프로그램을 시작하지 못했습니다.\n\n' + (error?.stack || error));
    app.quit();
  }
}

app.whenReady().then(start);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
