/* js/app/08-look-around.js · setView("map" or "look"), hintText(), the view switch buttons.
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- looking around (and switching views)
function setView(v) {
  view = v;
  document.querySelectorAll('.seg [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  stage.classList.toggle('look', v === 'look'); stage.classList.toggle('map', v === 'map');
  $('view-hint').textContent = hintText();
  render();
}
function hintText() {
  if (!pics.some(q => !q.p.hidden)) return pics.length ? 'Choose what your pictures are, then press Add next to each one.' : 'Add some pictures to begin.';
  return view === 'map' ? 'Drag a picture to move it · scroll over it to resize it (Shift + scroll to tilt) · click to choose it'
    : 'Drag to look around · scroll to zoom · walls and door frames should look upright';
}
document.querySelectorAll('.seg [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
