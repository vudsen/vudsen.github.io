mixins.home={mounted(){let o=this.$refs.menu,e=this.$refs.homeBackground;o.classList.add("menu-color");let t=e.dataset.image.split(","),s=Math.floor(Math.random()*t.length);e.style.backgroundImage=`url('${t[s]}')`},methods:{homeClick(){window.scrollTo({top:window.innerHeight,behavior:"smooth"})}}};