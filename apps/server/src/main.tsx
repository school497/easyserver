import '@fontsource-variable/inter/opsz.css';
import { mount } from '@easyserver/ui';

if ((globalThis as any).easyserverShell?.platform === 'darwin') document.body.classList.add('mac-vibrancy');
mount('server');
