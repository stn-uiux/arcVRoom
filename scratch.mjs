import paper from 'paper';
paper.setup(new paper.Size(100, 100));
const p1 = new paper.Path.Rectangle(new paper.Point(0,0), new paper.Size(50,50));
const p2 = new paper.Path.Rectangle(new paper.Point(25,25), new paper.Size(50,50));
const u = p1.unite(p2);
console.log(u.pathData);
