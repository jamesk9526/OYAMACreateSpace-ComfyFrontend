import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import {
  insertPromptPart,
  promptCategories,
  promptTrigger,
  searchPromptParts,
  type PromptPart,
  type PromptTrigger,
} from './prompt-parts';

export function PromptInput({
  value,
  onInsert,
  onChange,
  onKeyDown,
  onSelect,
  onBlur,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  value: string;
  onInsert(value: string): void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dismissed = useRef<{ value: string; start: number; end: number } | undefined>(undefined);
  const [trigger, setTrigger] = useState<PromptTrigger>();
  const [category, setCategory] = useState('All');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 480 });
  const id = useId();
  const results = searchPromptParts(trigger?.query || '', category);
  const dismiss = () => {
    const element = input.current;
    dismissed.current = element
      ? { value: element.value, start: element.selectionStart, end: element.selectionEnd }
      : undefined;
    setTrigger(undefined);
  };
  const refresh = (element: HTMLTextAreaElement) => {
    if (
      dismissed.current?.value === element.value &&
      dismissed.current.start === element.selectionStart &&
      dismissed.current.end === element.selectionEnd
    )
      return;
    dismissed.current = undefined;
    const next = promptTrigger(element.value, element.selectionStart, element.selectionEnd);
    setTrigger(next);
    if (next) {
      const rect = element.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(
          8,
          Math.min(window.innerHeight - 330, rect.top > 330 ? rect.top - 326 : rect.bottom + 6),
        ),
        width,
      });
    }
  };
  useEffect(() => {
    setActive(0);
  }, [trigger?.query, category]);
  useEffect(() => {
    if (trigger)
      document.getElementById(`${id}-${results[active]?.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, trigger, id, results]);
  useEffect(() => {
    if (!trigger) return;
    const close = (event: Event) => {
      if (
        event.type === 'resize' ||
        (!menu.current?.contains(event.target as Node) && event.target !== input.current)
      )
        dismiss();
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    // Scrolling a parent must not leave a detached popup over another control.
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [trigger]);
  const insert = (part: PromptPart) => {
    if (!trigger) return;
    const result = insertPromptPart(value, trigger, part.text);
    onInsert(result.value);
    setTrigger(undefined);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  return (
    <>
      <textarea
        {...props}
        ref={input}
        value={value}
        aria-autocomplete="list"
        aria-controls={trigger ? id : undefined}
        aria-expanded={Boolean(trigger)}
        aria-activedescendant={
          trigger && results[active] ? `${id}-${results[active].id}` : undefined
        }
        onChange={(event) => {
          onChange?.(event);
          refresh(event.currentTarget);
        }}
        onSelect={(event) => {
          onSelect?.(event);
          if (document.activeElement === input.current) refresh(event.currentTarget);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (!menu.current?.contains(event.relatedTarget as Node)) dismiss();
        }}
        onKeyDown={(event) => {
          if (
            trigger &&
            !event.nativeEvent.isComposing &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            if (event.key === 'Escape') {
              event.preventDefault();
              dismiss();
              return;
            }
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
              event.preventDefault();
              setActive((old) =>
                results.length
                  ? (old + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
                  : 0,
              );
              return;
            }
            if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
              if (results[active]) {
                event.preventDefault();
                insert(results[active]);
                return;
              }
            }
          }
          onKeyDown?.(event);
        }}
      />
      {trigger &&
        createPortal(
          <div className="prompt-parts-menu" ref={menu} style={position}>
            <div className="prompt-parts-heading">
              <b>// Prompt parts</b>
              <span>
                {results.length} {results.length === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                className="smallbtn"
                aria-label="Close prompt parts"
                onClick={() => {
                  dismiss();
                  input.current?.focus();
                }}
              >
                ×
              </button>
            </div>
            <select
              className="control"
              aria-label="Prompt part category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                input.current?.focus();
              }}
            >
              <option value="All">All categories</option>
              {promptCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <div className="prompt-parts-query">
              {trigger.query
                ? `Search: ${trigger.query}`
                : 'Type after // to search, or choose a category.'}
            </div>
            <div id={id} role="listbox" aria-label="Prompt parts" className="prompt-parts-results">
              {results.map((part, index) => (
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  id={`${id}-${part.id}`}
                  key={part.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => insert(part)}
                >
                  <span>
                    <b>{part.title}</b>
                    <small>{part.category}</small>
                  </span>
                  <p>{part.text}</p>
                </button>
              ))}
              {!results.length && (
                <p className="muted">No matching parts. Try another search or category.</p>
              )}
            </div>
            <div className="prompt-parts-help">↑ ↓ browse · Enter / Tab insert · Esc close</div>
          </div>,
          document.body,
        )}
    </>
  );
}
