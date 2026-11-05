// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon.js";

export interface MenuItem {
  key: string;
  label: string;
  icon?: string;
  /** The danger word and icon (sebaro: still opens its dialog). */
  danger?: boolean;
  /** A hairline before this row (the destructive row comes last after one). */
  separatorBefore?: boolean;
  disabled?: boolean;
  testId?: string;
  onSelect: () => void;
}

// sebaro's menu (spec/02 §4.10), its behaviour ported to React instead of
// sb-menu.js, as the adoption guide allows (ADO:131); markup and ARIA stay:
// a button with aria-haspopup, aria-expanded and popovertarget, and a
// ul.sb-menu[popover][role=menu] of li[role=none] > button[role=menuitem].
//
// The browser's popover opens and closes it, closes it on Escape and on a
// click outside, and hands focus back to the button. This adds what
// sb-menu.js does on top: the menu sits 4 px under its button, end on the
// button's end (above it when there is no room below, always inside the
// window); opening focuses the first row (ArrowUp on the button: the last);
// ArrowDown/ArrowUp move and wrap, Home/End jump, a typed letter jumps to the
// next row starting with it; Tab closes and lets focus move on; a change of
// the window's width closes it; choosing a row closes the menu and returns
// focus to the button BEFORE the row acts, so a row that opens a dialog hands
// focus back to the button when that dialog closes.
export function Menu({
  label,
  items,
  triggerTestId,
  menuTestId,
  compact = false,
}: {
  label: string;
  items: readonly MenuItem[];
  triggerTestId?: string;
  menuTestId?: string;
  /** sebaro's 32 px icon button, for a dense surface (the canvas). */
  compact?: boolean;
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const focusLast = useRef(false);

  const rows = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  function place() {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const gap = 4;
    const edge = 8;
    const b = button.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const below = b.bottom + gap;
    const top =
      below + height <= window.innerHeight - edge || b.top - gap - height < edge
        ? below
        : b.top - gap - height;
    const left = Math.min(
      Math.max(edge, b.right - width),
      window.innerWidth - edge - width,
    );
    menu.style.top = `${Math.max(edge, top)}px`;
    menu.style.left = `${Math.max(edge, left)}px`;
  }

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    function toggled(event: Event) {
      const isOpen = (event as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (!isOpen) {
        // Escape hands the focus back to the button. Chromium does that for
        // a popover by itself, WebKit does not; a Tab or a click elsewhere
        // has already moved the focus by the time this runs, and keeps it.
        const active = document.activeElement;
        if (
          active === null ||
          active === document.body ||
          menu?.contains(active)
        )
          buttonRef.current?.focus();
        return;
      }
      place();
      const list = rows();
      (focusLast.current ? list.at(-1) : list[0])?.focus();
      focusLast.current = false;
    }
    menu.addEventListener("toggle", toggled);
    return () => menu.removeEventListener("toggle", toggled);
  }, []);

  // Follows its button on scroll and when only the height changes (address
  // bar, keyboard); a change of the width closes it, as a native menu does.
  useEffect(() => {
    if (!open) return;
    let width = window.innerWidth;
    function resized() {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        menuRef.current?.hidePopover();
        return;
      }
      place();
    }
    window.addEventListener("resize", resized);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", resized);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function close() {
    menuRef.current?.hidePopover();
    buttonRef.current?.focus();
  }

  function onMenuKey(event: React.KeyboardEvent<HTMLUListElement>) {
    const list = rows();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home" || event.key === "PageUp") go(0);
    else if (event.key === "End" || event.key === "PageDown")
      go(list.length - 1);
    else if (event.key === "Tab") menuRef.current?.hidePopover();
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLocaleLowerCase();
      const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
      const hit = order.find((row) =>
        (row.textContent ?? "").trim().toLocaleLowerCase().startsWith(letter),
      );
      if (hit) {
        event.preventDefault();
        hit.focus();
      }
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={
          compact ? "sb-icon-button sb-icon-button--compact" : "sb-icon-button"
        }
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        popoverTarget={menuId}
        data-testid={triggerTestId}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            focusLast.current = event.key === "ArrowUp";
            menuRef.current?.showPopover();
          }
        }}
      >
        <Icon name="more-horizontal" />
      </button>
      <ul
        ref={menuRef}
        id={menuId}
        className="sb-menu"
        role="menu"
        aria-label={label}
        popover="auto"
        data-testid={menuTestId}
        onKeyDown={onMenuKey}
      >
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.separatorBefore ? (
              <li role="separator" className="sb-menu__sep" />
            ) : null}
            <li role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                data-testid={item.testId}
                className={
                  item.danger
                    ? "sb-menu__item sb-menu__item--danger"
                    : "sb-menu__item"
                }
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon ? <Icon name={item.icon} /> : null}
                {item.label}
              </button>
            </li>
          </Fragment>
        ))}
      </ul>
    </>
  );
}
