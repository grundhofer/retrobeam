// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";

interface MenuRow {
  key: string;
  label: string;
  icon?: string;
  /** A hairline before this row (the destructive row comes last after one). */
  separatorBefore?: boolean;
  testId?: string;
}

export interface MenuAction extends MenuRow {
  /** The danger word and icon (sebaro: still opens its dialog). */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  submenu?: undefined;
}

/** A row that opens a submenu of choices (spec/02 §4.24): „Hell oder
 *  Dunkel“ › Wie das System · Hell · Dunkel. */
export interface MenuParent extends MenuRow {
  submenu: readonly MenuChoice[];
  onSelect?: undefined;
}

/** One choice of a submenu, a menuitemradio with its check. */
export interface MenuChoice {
  key: string;
  label: string;
  checked: boolean;
  /** The choice's own language, for a language's name in itself. */
  lang?: string;
  testId?: string;
  /** A sebaro script's hook on the item, e.g. data-sb-tone-item: the
   *  script acts on the click, after the menu has closed. */
  data?: Readonly<Record<`data-${string}`, string>>;
  onSelect: () => void;
}

export type MenuItem = MenuAction | MenuParent;

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
//
// A row with a submenu opens it as sb-menu.js does (spec/02 §4.24, D95): on
// a click, Enter, Space or ArrowRight, on its first choice; the submenu is a
// nested popover beside the menu, level with its row, on the reading side if
// it fits there, else on the other; where it fits on neither (a phone) it
// takes the menu's place with a back row („‹ Mehr“, named „Zurück zu
// Mehr“) and the menu stays open but hidden. ArrowLeft, Escape and the back
// row go back to the row; choosing closes everything.
export function Menu({
  label,
  items,
  triggerTestId,
  menuTestId,
  compact = false,
  trigger,
}: {
  label: string;
  items: readonly MenuItem[];
  triggerTestId?: string;
  menuTestId?: string;
  /** sebaro's 32 px icon button, for a dense surface (the canvas). */
  compact?: boolean;
  /** A key with words instead of „⋯“ (a compact secondary action), for a
   *  menu that names what it offers. `label` still names the menu. */
  trigger?: { text: string; icon: string };
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const focusLast = useRef(false);

  const rows = () => (menuRef.current ? rowsOf(menuRef.current) : []);
  // Where some rows have an icon, a row without one keeps its place, so the
  // words of all rows start on one line.
  const slots = items.some((item) => item.icon !== undefined);

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
    // A menu taller than the room on either side moves up until its end is
    // inside the window (its height is capped at the window's, so it then
    // scrolls); it may then lie over its button.
    const inside = Math.min(top, window.innerHeight - edge - height);
    menu.style.top = `${Math.max(edge, inside)}px`;
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
      follow();
    }
    function follow() {
      place();
      menuRef.current
        ?.querySelectorAll<HTMLUListElement>(".sb-menu:popover-open")
        .forEach((sub) => sub.dispatchEvent(new Event("sb-menu-follow")));
    }
    window.addEventListener("resize", resized);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", resized);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  function close() {
    menuRef.current?.hidePopover();
    buttonRef.current?.focus();
  }

  // One handler for the menu and each submenu: it moves among the rows of
  // the menu it is on (a submenu's keys never reach its parent).
  function onMenuKey(event: React.KeyboardEvent<HTMLUListElement>) {
    event.stopPropagation();
    const list = rowsOf(event.currentTarget);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    const inward = isRtl(event.currentTarget) ? "ArrowLeft" : "ArrowRight";
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home" || event.key === "PageUp") go(0);
    else if (event.key === "End" || event.key === "PageDown")
      go(list.length - 1);
    else if (event.key === "Tab") menuRef.current?.hidePopover();
    else if (event.key === inward) {
      const row = list[index];
      const sub = row?.getAttribute("aria-haspopup")
        ? row.parentElement?.querySelector<HTMLUListElement>(".sb-menu")
        : null;
      if (sub) {
        event.preventDefault();
        // shown at once, so its first choice takes the focus before the
        // next key arrives
        sub.showPopover();
        firstChoice(sub)?.focus({ preventScroll: true });
      }
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
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
          trigger
            ? "sb-secondary-action sb-secondary-action--compact"
            : compact
              ? "sb-icon-button sb-icon-button--compact"
              : "sb-icon-button"
        }
        aria-label={trigger ? undefined : label}
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
        {trigger ? (
          <>
            <Icon name={trigger.icon} size={20} />
            {trigger.text}
          </>
        ) : (
          <Icon name="more-horizontal" />
        )}
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
            {item.submenu ? (
              <SubMenu
                item={item}
                slot={slots}
                parentLabel={label}
                onKeyDown={onMenuKey}
                onChoose={(choice) => {
                  close();
                  choice.onSelect();
                }}
              />
            ) : (
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
                  <RowIcon icon={item.icon} slot={slots} />
                  {item.label}
                </button>
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </>
  );
}

// The rows of one menu, not those of its submenus; the back row first.
function rowsOf(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>(
      ':scope > li > :is([role="menuitem"], [role="menuitemradio"]):not(:disabled)',
    ),
  );
}

// A submenu's first choice, after the back row.
function firstChoice(menu: HTMLElement): HTMLButtonElement | undefined {
  return rowsOf(menu).find((row) => !row.classList.contains("sb-menu__back"));
}

function isRtl(element: Element): boolean {
  return getComputedStyle(element).direction === "rtl";
}

const REPLACED = "data-sb-replaced";

// A row and its submenu of choices in one li (the ARIA APG form): the row
// carries aria-haspopup, aria-expanded and popovertarget, the submenu is a
// nested popover named like its row.
function SubMenu({
  item,
  slot,
  parentLabel,
  onKeyDown,
  onChoose,
}: {
  item: MenuParent;
  slot: boolean;
  parentLabel: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLUListElement>) => void;
  onChoose: (choice: MenuChoice) => void;
}) {
  const { t } = useTranslation();
  const subId = `${useId()}-sub`;
  const rowRef = useRef<HTMLButtonElement>(null);
  const subRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  // In the menu's place (no room beside it), with the back row.
  const [drill, setDrill] = useState(false);
  const focusWasInside = useRef(false);

  // Beside the menu, the first row level with the row that opened it, the
  // two layer lines on each other; the reading side first. A side counts
  // only when the submenu fits into the window there.
  const placeSub = useCallback(() => {
    const sub = subRef.current;
    const row = rowRef.current;
    const parent = sub?.parentElement?.closest<HTMLElement>(".sb-menu");
    if (!sub || !row || !parent) return;
    const edge = 8;
    const style = getComputedStyle(sub);
    const line = parseFloat(style.borderTopWidth) || 0;
    const pad = parseFloat(style.paddingTop) || 0;
    const p = parent.getBoundingClientRect();
    const it = row.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const clampY = (top: number, h: number) =>
      Math.min(Math.max(edge, top), Math.max(edge, vh - h - edge));
    if (!drill) {
      sub.style.inlineSize = "";
      const w = sub.offsetWidth;
      const h = sub.offsetHeight;
      const x = { right: p.right - line, left: p.left - w + line };
      const order: ("right" | "left")[] = isRtl(row)
        ? ["left", "right"]
        : ["right", "left"];
      const side = order.find((at) => x[at] >= edge && x[at] + w <= vw - edge);
      if (side !== undefined) {
        sub.style.left = `${Math.round(x[side])}px`;
        sub.style.top = `${Math.round(clampY(it.top - pad - line, h))}px`;
        return;
      }
      setDrill(true);
      return;
    }
    sub.style.inlineSize = `${Math.round(p.width)}px`;
    sub.style.left = `${Math.round(p.left)}px`;
    sub.style.top = `${Math.round(clampY(p.top, sub.offsetHeight))}px`;
  }, [drill]);

  useLayoutEffect(() => {
    const sub = subRef.current;
    const parent = sub?.parentElement?.closest<HTMLElement>(".sb-menu");
    if (!open || !sub || !parent) return;
    placeSub();
    if (drill) parent.setAttribute(REPLACED, "");
  }, [open, drill, placeSub]);

  useEffect(() => {
    const sub = subRef.current;
    if (!sub) return;
    function beforeToggle(event: Event) {
      if ((event as ToggleEvent).newState === "open") return;
      focusWasInside.current = sub?.contains(document.activeElement) ?? false;
      sub?.parentElement
        ?.closest<HTMLElement>(".sb-menu")
        ?.removeAttribute(REPLACED);
    }
    function toggled(event: Event) {
      const isOpen = (event as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        // opened by a click, Enter or Space: on its first choice
        if (!sub?.contains(document.activeElement)) {
          firstChoice(sub!)?.focus({ preventScroll: true });
        }
        return;
      }
      setDrill(false);
      // Escape, ArrowLeft and the back row go back to the row; a choice or
      // a click elsewhere has moved the focus already.
      if (focusWasInside.current)
        rowRef.current?.focus({ preventScroll: true });
    }
    sub.addEventListener("beforetoggle", beforeToggle);
    sub.addEventListener("toggle", toggled);
    sub.addEventListener("sb-menu-follow", placeSub);
    return () => {
      sub.removeEventListener("beforetoggle", beforeToggle);
      sub.removeEventListener("toggle", toggled);
      sub.removeEventListener("sb-menu-follow", placeSub);
    };
  }, [placeSub]);

  function goBack() {
    focusWasInside.current = true;
    subRef.current?.hidePopover();
  }

  const outward = (element: Element) =>
    isRtl(element) ? "ArrowRight" : "ArrowLeft";

  return (
    <li role="none">
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        popoverTarget={subId}
        data-testid={item.testId}
        className="sb-menu__item"
      >
        <RowIcon icon={item.icon} slot={slot} />
        {item.label}
        <span className="sb-menu__sub" aria-hidden="true">
          <Icon name="chevron-right" size={16} />
        </span>
      </button>
      <ul
        ref={subRef}
        id={subId}
        className="sb-menu"
        role="menu"
        aria-label={item.label}
        popover="auto"
        onKeyDown={(event) => {
          if (event.key === outward(event.currentTarget)) {
            event.preventDefault();
            event.stopPropagation();
            goBack();
            return;
          }
          onKeyDown(event);
        }}
      >
        {drill ? (
          <li role="none" className="sb-menu__back-row">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="sb-menu__item sb-menu__back"
              aria-label={t("menu.backTo", { name: parentLabel })}
              onClick={goBack}
            >
              <span className="sb-menu__back-mark" aria-hidden="true">
                <Icon name="chevron-right" size={16} />
              </span>
              {parentLabel}
            </button>
          </li>
        ) : null}
        {item.submenu.map((choice) => (
          <li role="none" key={choice.key}>
            <button
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={choice.checked}
              lang={choice.lang}
              data-testid={choice.testId}
              {...choice.data}
              className="sb-menu__item"
              onClick={() => onChoose(choice)}
            >
              <span className="sb-menu__check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
              {choice.label}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

// A row's icon, or an empty place of its size.
function RowIcon({ icon, slot }: { icon: string | undefined; slot: boolean }) {
  if (icon !== undefined) return <Icon name={icon} />;
  return slot ? <span aria-hidden="true" style={ICON_SLOT} /> : null;
}

const ICON_SLOT = {
  flex: "none",
  inlineSize: "var(--sb-size-icon-lg)",
  blockSize: "var(--sb-size-icon-lg)",
} as const;
