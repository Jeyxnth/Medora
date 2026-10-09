// Citation chips on the same page: ask FocusHighlight to scroll to an element and flash it.
// Every call dispatches a new event, so repeating the same click works every time.
export const FOCUS_EVENT = "medora:focus";

export function focusItem(id: string) {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { id } }));
}
