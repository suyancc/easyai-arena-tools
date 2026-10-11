export const COMMUNITY_QQ = '1053996918';
export function bindCommunityCopy(button: HTMLButtonElement, status: HTMLElement, write: (text: string) => Promise<void> = text => navigator.clipboard.writeText(text)) {
  let timer: ReturnType<typeof setTimeout> | undefined, copying = false;
  button.onclick = async () => {
    if (copying) return;
    copying = true; clearTimeout(timer);
    try { await write(COMMUNITY_QQ); status.textContent = '已复制'; }
    catch { status.textContent = '请手动复制'; }
    finally {
      copying = false;
      timer = setTimeout(() => { status.textContent = '复制'; }, 2000);
    }
  };
}
