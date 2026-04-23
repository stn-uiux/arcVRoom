import paper from 'paper';
paper.setup(new paper.Size(100, 100));
const item1 = paper.project.importSVG(`<path d="M0,0 L50,0 L50,50 L0,50 Z"/>`);
console.log(item1.className);
const path1 = item1.className === 'Group' ? item1.children[0] : item1;
console.log(path1.className);
