/**
 * The single close/dismiss (X) affordance for the whole app.
 *
 * Deliberately carries **no border and no background in any state** — the icon
 * itself is the affordance and turns the platform accent blue on hover. Before
 * this existed, close buttons drifted into five different treatments: an
 * opacity-only fade (dialog, sheet), a tinted fill (`bg-brand-cta-tint`), an
 * off-token fill (`bg-blue-50`), a bordered pill (`ad-strip`), and a bare
 * `<button>` with no styling at all.
 *
 * `cursor-pointer` is explicit because most call sites are bare `<button>`
 * elements rather than the `Button` primitive (which sets it in its base).
 * `h-8 w-8` gives the 16px icon a real tap target; pair it with `top-3 right-3`
 * rather than `top-4 right-4` when absolutely positioning inside a panel, so the
 * icon lands where a bare icon used to sit.
 */
export const CLOSE_BUTTON_CLASS =
  "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-text-secondary transition-colors hover:bg-transparent hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:pointer-events-none disabled:opacity-50 sm:h-8 sm:w-8 [&_svg]:pointer-events-none [&_svg]:shrink-0";
