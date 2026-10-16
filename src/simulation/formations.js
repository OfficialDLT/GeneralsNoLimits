export const formations = { box: 'Blok', line: 'Linie', column: 'Kolom', wedge: 'V-formatie', loose: 'Verspreid' };
export function formationOffset(index, count, mode = 'box', spacing = 12) {
  const columns = Math.ceil(Math.sqrt(count));
  if (mode === 'line') return { x: (index - (count - 1) / 2) * spacing, z: 0 };
  if (mode === 'column') return { x: 0, z: (index - (count - 1) / 2) * spacing };
  if (mode === 'wedge') {
    const row = Math.ceil(index / 2);
    return { x: index ? (index % 2 ? -1 : 1) * row * spacing : 0, z: -row * spacing };
  }
  const distance = spacing * (mode === 'loose' ? 2 : 1);
  return { x: (index % columns - (columns - 1) / 2) * distance,
    z: (Math.floor(index / columns) - (Math.ceil(count / columns) - 1) / 2) * distance };
}
