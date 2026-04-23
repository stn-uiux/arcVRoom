import paper from 'paper';
paper.setup(new paper.Size(100, 100));
const path1 = new paper.CompoundPath('M0,0 L50,0 L50,50 L0,50 Z');
console.log(path1.className);
