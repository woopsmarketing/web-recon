/**
 * The search row under the pager: a bordered strip on the quiet surface holding a text field and
 * an icon button. Controlled by the list component (value / onChange / onSubmit); the form posts
 * to the list route as a plain GET (?q=) so it is a real form without script.
 *   <SearchBox id label placeholder? buttonLabel value onChange onSubmit action />
 */
export interface SearchBoxProps {
  id: string;
  label: string;
  placeholder?: string;
  buttonLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  action: string;
}

export function SearchBox({ id, label, placeholder, buttonLabel, value, onChange, onSubmit, action }: SearchBoxProps) {
  return (
    <form
      className="i3-psearch"
      role="search"
      method="get"
      action={action}
      data-list-search=""
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="i3-sr">
        {label}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        className="i3-psearch__input"
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={80}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="submit" className="i3-psearch__btn" aria-label={buttonLabel}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10 10 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
