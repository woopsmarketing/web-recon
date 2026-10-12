/**
 * Every refusal of the design module carries one of these codes.
 *
 *   design_invalid       a design document or a preset file breaks the contract; `path` names the value
 *   design_unavailable   the template has no design system, or the named preset does not exist
 *   design_unsupported   a valid request this milestone cannot express (typography "soft-rounded")
 *   design_placeholder   a preset names a variant that is still a placeholder (release gate)
 *   contrast_too_low     a colour of the resulting site does not read on the surface it lands on
 *   design_fonts_invalid the font files in this checkout are not the ones the release pins
 */
export type DesignErrorCode = "design_invalid" | "design_unavailable" | "design_unsupported" | "design_placeholder" | "contrast_too_low" | "design_fonts_invalid";

export interface DesignIssue {
  code: DesignErrorCode;
  /** dotted path of the offending value, relative to the document named in the message ("design.home.2.variant") */
  path: string;
  message: string;
}

export class DesignError extends Error {
  readonly code: DesignErrorCode;
  readonly issues: readonly DesignIssue[];
  constructor(code: DesignErrorCode, message: string, issues: readonly DesignIssue[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}` : message);
    this.name = "DesignError";
    this.code = code;
    this.issues = issues;
  }
}
