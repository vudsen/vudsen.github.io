window.addEventListener("load",(()=>{const e="$toTopHeight";let t=0;const n="lazy";let o=[...document.getElementsByTagName("img")];console.log(`图片懒加载: 一共找到了${o.length}张图片`),setTimeout((()=>{t++,l()}),500);const i=()=>{l()};function l(){if(0===o.length)return console.log("所有图片均已加载"),void window.removeEventListener("scroll",i);const e=[];for(let t=0,n=o.length;t<n;++t){const n=o[t];s(n)?(console.log("已经加载图片: ",n),r(n)):e.push(n)}o=e}function r(e){const t=e.getAttribute(n);t&&(e.setAttribute("src",t),e.removeAttribute(n))}function s(n){if(!n)return!1;const o=function(n){const o=n[e];if(o&&o.version===t)return n[e].value;let i=n,l=0;do{l+=i.offsetTop,i=i.offsetParent}while(i);return n[e]={value:l,version:t},l}(n);return document.documentElement.scrollTop+document.documentElement.clientHeight>=o}window.addEventListener("scroll",i),window.addEventListener("resize",(()=>{t++}))}));