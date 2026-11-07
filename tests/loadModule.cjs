const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('@babel/core');
const cache=new Map();
module.exports=function loadModule(name){
 const file=path.resolve('src',name.endsWith('.js')?name:name+'.js');
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const code=transformSync(fs.readFileSync(file,'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 vm.runInNewContext(code,{exports,require:(dependency)=>{if(!dependency.startsWith('./'))throw Error('Unexpected dependency');return module.exports(path.relative(path.resolve('src'),path.resolve(path.dirname(file),dependency)));},URL,Date,Intl,fetch,AbortController,setTimeout,clearTimeout,setInterval,clearInterval});
 return exports;
};
