/**
 * The facts table of a project detail: one row per authored fact, label (th, quiet surface) and
 * value (td) in the form-table grammar; ≤ 768 the cells stack (label over value, no rules).
 *   <FactsTable rows={[{ key, label, value }]} />
 */
export interface FactRow {
  key: string;
  label: string;
  value: string;
}

export function FactsTable({ rows }: { rows: FactRow[] }) {
  return (
    <table className="i3-facts" data-facts="">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-fact={r.key}>
            <th scope="row">{r.label}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
