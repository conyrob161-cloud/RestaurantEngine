const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');
function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();
let score=0;
function loop(){ctx.fillStyle='#1b1b1b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.font='28px Arial';ctx.fillText('Chef Slice Prototype',20,40);ctx.fillText('Score: '+score,20,80);requestAnimationFrame(loop);}loop();