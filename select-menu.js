// Keep the native select as the value source; render a themed, keyboard accessible menu.
export function enhanceSelect(select) {
  const host = document.createElement('div');
  host.className = 'select-menu';
  select.after(host);
  select.hidden = true;
  const label = select.parentElement.querySelector('span');
  if (label) label.id = select.id + '-label';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.id = select.id + '-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.id = select.id + '-value';
  trigger.append(value);
  const chevron = document.createElement('span');
  chevron.textContent = '⌄';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(chevron);
  trigger.setAttribute('aria-labelledby', [label?.id, value.id].filter(Boolean).join(' '));
  const list = document.createElement('div');
  list.className = 'select-options';
  list.id = select.id + '-options';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  if (label) list.setAttribute('aria-labelledby', label.id);
  trigger.setAttribute('aria-controls', list.id);
  host.append(trigger, list);
  const items = [...select.options].map((option, index) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('role', 'option');
    b.id = select.id + '-option-' + index;
    b.onclick = (e) => {
      e.preventDefault();
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    };
    list.append(b);
    return b;
  });
  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent || '';
    items.forEach((b, i) => {
      b.textContent = select.options[i].textContent;
      b.setAttribute('aria-selected', String(i === select.selectedIndex));
      b.disabled = select.options[i].disabled;
    });
    trigger.disabled = select.disabled;
  }
  function close(focus = false) {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function open() {
    sync();
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    host.classList.toggle(
      'open-above',
      Math.min(innerHeight, host.closest('dialog')?.getBoundingClientRect().bottom ?? innerHeight) -
        trigger.getBoundingClientRect().bottom <
        Math.min(list.scrollHeight, 280) + 15,
    );
    items[Math.max(0, select.selectedIndex)]?.focus();
  }
  trigger.onclick = (e) => {
    e.preventDefault();
    list.hidden ? open() : close(true);
  };
  let prefix = '',
    typedAt = 0;
  host.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (list.hidden) open();
      else if (items.includes(document.activeElement)) document.activeElement.click();
      else close(true);
      return;
    }
    if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
      return;
    }
    if (e.key === 'Tab') {
      if (!list.hidden) close(true);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (list.hidden) {
        open();
        return;
      }
      const index = items.indexOf(document.activeElement),
        step = e.key === 'ArrowDown' ? 1 : -1;
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (index + step + items.length) % items.length;
      items[next].focus();
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey) {
      if (list.hidden) open();
      prefix = Date.now() - typedAt < 650 ? prefix + e.key : e.key;
      typedAt = Date.now();
      items
        .find((b) => b.textContent.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))
        ?.focus();
    }
  };
  const outside = (e) => {
    if (!host.contains(e.target)) close();
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  const observer = new MutationObserver(sync);
  observer.observe(select, { subtree: true, childList: true, characterData: true });
  select.addEventListener('change', sync);
  sync();
  return {
    sync,
    close,
    dispose() {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      select.removeEventListener('change', sync);
    },
  };
}
