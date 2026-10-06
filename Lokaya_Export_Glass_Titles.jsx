#target aftereffects
/* Exports the supplied title compositions through native After Effects.
   Writes only new output projects; originals are reopened from their source files. */
(function () {
 var kit = new File($.fileName).parent, win = /windows/i.test($.os), log = [], exported = [], prepared = [], failures = [], original = null, touchedProject = false, failedFolders = [], statusWindow;
 var sources = [
  {file:new File(kit.fsName+'/sources/bold/After Effects/Bold Glass Box Titles.aep'),prefix:'bold-glass-title-',title:'Bold Glass Title ',pattern:/^_ Final Title (\d\d)$/,count:4},
  {file:new File(kit.fsName+'/sources/bubble/Project File/Glossy Glass Bubble Titles 3D.aep'),prefix:'bubble-glass-title-',title:'Bubble Glass Title ',pattern:/^Title (\d\d)$/,count:9},
  {file:new File(kit.fsName+'/sources/shape/After Effects/Glass Shape Titles.aep'),prefix:'glass-shape-title-',title:'Glass Shape Title ',pattern:/^Final Title (\d\d)$/,count:4}
 ];
 function mkdir(f){if(!f.exists&&!f.create())throw Error('Cannot create folder: '+f.fsName);return f;}
 function write(file,text){file.encoding='UTF-8';if(!file.open('w'))throw Error('Cannot write '+file.fsName);file.write(text);file.close();}
 function read(file){if(!file.exists)return '';file.encoding='UTF-8';if(!file.open('r'))return '';var s=file.read();file.close();return s;}
 function json(v){
  if(v===null)return 'null';var t=typeof v,i,a=[];
  if(t==='string')return '"'+v.replace(/[\\"\x00-\x1f]/g,function(c){var m={'\\':'\\\\','"':'\\"','\n':'\\n','\r':'\\r','\t':'\\t'};return m[c]||'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';
  if(t==='number')return isFinite(v)?String(v):'null';if(t==='boolean')return v?'true':'false';
  if(v instanceof Array){for(i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}
  for(i in v)if(v.hasOwnProperty(i)&&v[i]!==undefined)a.push(json(i)+':'+json(v[i]));return '{'+a.join(',')+'}';
 }
 function quote(s){s=String(s);if(win){if(/["%\r\n]/.test(s))throw Error('Unsupported character in selected folder path.');return '"'+s+'"';}return "'"+s.replace(/'/g,"'\\''")+"'";}
 function run(args,logfile){var a=[],i;for(i=0;i<args.length;i++)a.push(quote(args[i]));var inner=a.join(' ');if(logfile)inner+=' 2>'+quote(logfile.fsName);return system.callSystem(win?'cmd.exe /d /s /c "'+inner+'"':inner);}
 function removeFolder(folder){if(!folder.exists)return;var files=folder.getFiles();for(var i=0;i<files.length;i++){if(files[i] instanceof Folder)removeFolder(files[i]);else files[i].remove();}folder.remove();}
 function restoreProject(){if(!touchedProject)return;closeDiscard();if(original)app.open(original);else app.newProject();touchedProject=false;}
 function progress(text){if(statusWindow){statusWindow.label.text=text;statusWindow.update();}}
 function closeDiscard(){if(app.project)app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);}
 function findFFmpeg(){
  var arm=!win&&/arm64/.test(system.callSystem('/usr/bin/uname -m')),roots=[],dirs,i,j,ext,candidates,k;
  if(win){roots.push(new Folder(Folder.userData.fsName+'/Adobe/CEP/extensions'));roots.push(new Folder('C:/Program Files (x86)/Common Files/Adobe/CEP/extensions'));roots.push(new Folder('C:/Program Files/Common Files/Adobe/CEP/extensions'));}
  else{roots.push(new Folder(Folder.userData.fsName+'/Adobe/CEP/extensions'));roots.push(new Folder('/Library/Application Support/Adobe/CEP/extensions'));roots.push(new Folder('~/Library/Application Support/Adobe/CEP/extensions'));}
  for(i=0;i<roots.length;i++){if(!roots[i].exists)continue;dirs=roots[i].getFiles();for(j=0;j<dirs.length;j++){if(!(dirs[j] instanceof Folder))continue;ext=dirs[j].fsName;
   candidates=win?[ext+'/vendor/autocaption/bin/ffmpeg-win32-x64.exe',ext+'/vendor/elements-decoder/win64/ffmpeg.exe']:[ext+'/vendor/autocaption/bin/ffmpeg-darwin-'+(arm?'arm64':'x64')];
   for(k=0;k<candidates.length;k++){var f=new File(candidates[k]);if(f.exists){var result=run([f.fsName,'-version']);if(/ffmpeg version/i.test(result))return f;}}
  }}
  var selected=File.openDialog('Select FFmpeg from the installed Lokaya folder (vendor/autocaption/bin).');
  if(!selected)throw Error('FFmpeg is required for compact animated previews.');
  if(!/ffmpeg version/i.test(run([selected.fsName,'-version'])))throw Error('The selected FFmpeg could not be verified. Choose the executable for this operating system.');return selected;
 }
 function scanFiles(dir,index,depth){if(depth>9)return;var entries=dir.getFiles(),i,f,key;for(i=0;i<entries.length;i++){f=entries[i];if(f instanceof Folder)scanFiles(f,index,depth+1);else{key=decodeURI(f.name).toLowerCase();if(!index[key])index[key]=[];index[key].push(f);}}}
 function preserveDependencies(main){
  var seen={},keep=[],all={},i;
  for(i=1;i<=app.project.numItems;i++){var it=app.project.item(i);if(it instanceof CompItem){if(!all[it.name])all[it.name]=[];all[it.name].push(it);}}
  function expression(p){
   try{if(p.canSetExpression&&p.expressionEnabled){var e=p.expression,re=/\bcomp\s*\(\s*(["'])([^"']+)\1\s*\)/g,m,count=0;while((m=re.exec(e))){count++;if(!all[m[2]])throw Error('Missing expression composition: '+m[2]);for(var match=0;match<all[m[2]].length;match++)visit(all[m[2]][match]);}
    var calls=e.match(/\bcomp\s*\(/g);if(calls&&calls.length!==count)throw Error('Dynamic comp() reference needs manual collection.');
   }}catch(error){if(/Missing expression|Dynamic comp/.test(String(error)))throw error;}
   if(p.numProperties)for(var x=1;x<=p.numProperties;x++)expression(p.property(x));
  }
  function visit(c){if(seen[c.id])return;seen[c.id]=true;keep.push(c);for(var n=1;n<=c.numLayers;n++){var l=c.layer(n);if(l.source instanceof CompItem)visit(l.source);expression(l);}}
  visit(main);app.project.reduceProject(keep);
 }
 function collectMedia(sourceFile,folder){
  var index={},media=mkdir(new Folder(folder.fsName+'/media')),i,serial=0;scanFiles(sourceFile.parent.parent,index,0);
  for(i=1;i<=app.project.numItems;i++){var it=app.project.item(i);if(!(it instanceof FootageItem))continue;
   var f=it.file;if(!f&&it.mainSource&&it.mainSource.missingFootagePath)f=new File(it.mainSource.missingFootagePath);if(!f)continue;
   if(!f.exists){var matches=index[decodeURI(f.name).toLowerCase()];if(!matches||matches.length!==1)throw Error('Missing or ambiguous source media: '+f.name);f=matches[0];}
   if(!it.mainSource.isStill&&/\.(?:png|jpe?g|tiff?|exr)$/i.test(f.name))throw Error('Image sequence requires separate collection: '+f.name);
   var name=('000'+(++serial)).slice(-3)+'_'+decodeURI(f.name).replace(/[^a-zA-Z0-9._-]/g,'_'),dest=new File(media.fsName+'/'+name);
   if(!f.copy(dest.fsName))throw Error('Cannot collect '+f.fsName);
   var oldName=it.name,settings={},fields=['alphaMode','premulColor','invertAlpha','conformFrameRate','fieldSeparationType','highQualityFieldSeparation','removePulldown','loop'],x;
   for(x=0;x<fields.length;x++)try{settings[fields[x]]=it.mainSource[fields[x]];}catch(_){}
   it.replace(dest);it.name=oldName;for(x=0;x<fields.length;x++)try{if(settings[fields[x]]!==undefined)it.mainSource[fields[x]]=settings[fields[x]];}catch(_){}
   if(it.footageMissing)throw Error('Collected footage did not relink: '+oldName);
  }
 }
 function clearQueue(){while(app.project.renderQueue.numItems)app.project.renderQueue.item(1).remove();}
 function renderFiles(dir,files){var entries=dir.getFiles();for(var i=0;i<entries.length;i++){if(entries[i] instanceof Folder)renderFiles(entries[i],files);else files.push(entries[i]);}}
 function concatFrames(frames,rate){var lines=['ffconcat version 1.0'];for(var i=0;i<frames.length;i++){lines.push("file '"+frames[i].fsName.replace(/\\/g,'/').replace(/'/g,"'\\''")+"'");lines.push('duration '+String(1/rate));}return lines.join('\n')+'\n';}
 function renderPreview(main,folder,ffmpeg){
  clearQueue();var raw=mkdir(new Folder(folder.fsName+'/_render')),item=app.project.renderQueue.items.add(main),om=item.outputModule(1),templates=om.templates,chosen='',i;
  for(i=0;i<templates.length;i++)if(/png/i.test(templates[i])){chosen=templates[i];break;}
  if(!chosen)for(i=0;i<templates.length;i++)if(/^Lossless$/i.test(templates[i]))chosen=templates[i];
  if(!chosen)throw Error('PNG Sequence or Lossless output template is required.');
  om.applyTemplate(chosen);om=item.outputModule(1);
  var format=om.getSettings(GetSettingsFormat.STRING).Format,isPNG=/png/i.test(format),extension=isPNG?'.png':/quicktime/i.test(format)?'.mov':/avi/i.test(format)?'.avi':'';
  if(!extension)throw Error('Unsupported preview output format: '+format);
  var filename=isPNG?'render_[#####].png':'render'+extension;
  om.setSettings({'Output File Info':{'Base Path':raw.fsName,'Subfolder Path':'','File Name':filename}});om=item.outputModule(1);om.file=new File(raw.fsName+'/'+filename);
  try{item.setSetting('Resolution','Half');}catch(_){}
  item.timeSpanStart=0;item.timeSpanDuration=Math.min(main.duration,12);item.render=true;
  app.project.renderQueue.render();
  var files=[];renderFiles(raw,files);var media=[],actual=item.outputModule(1).file;
  for(i=0;i<files.length;i++)if((isPNG?/\.png$/i:/\.(mov|avi)$/i).test(files[i].name)&&files[i].length>0)media.push(files[i]);
  if(!isPNG&&actual){actual=new File(actual.fsName);if(actual.exists&&actual.length>0&&media.length===0)media.push(actual);}
  media.sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:0;});
  var expected=Math.round(item.timeSpanDuration*main.frameRate);
  log.push('RENDER '+main.name+' status='+String(item.status)+' format='+format+' files='+media.length+' expectedFrames='+expected+' output='+(actual?actual.fsName:'none'));
  if(item.status!==RQItemStatus.DONE||!media.length||(isPNG&&Math.abs(media.length-expected)>1))throw Error('Preview render incomplete. Status='+String(item.status)+'; files='+media.length+'; expectedFrames='+expected+'; output='+(actual?actual.fsName:raw.fsName));
  var preview=new File(folder.fsName+'/preview.mp4'),poster=new File(folder.fsName+'/poster.jpg'),err=new File(folder.fsName+'/ffmpeg.log'),inputArgs=[];
  if(isPNG){var list=new File(raw.fsName+'/frames.ffconcat');write(list,concatFrames(media,main.frameRate));inputArgs=['-f','concat','-safe','0','-i',list.fsName];}else inputArgs=['-i',media[0].fsName];
  var args=[ffmpeg.fsName,'-hide_banner','-loglevel','error','-nostdin','-y'].concat(inputArgs).concat(['-an','-vf','scale=640:640:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2','-r',String(main.frameRate),'-c:v','libx264','-pix_fmt','yuv420p','-crf','22','-preset','veryfast','-movflags','+faststart',preview.fsName]);
  run(args,err);preview=new File(preview.fsName);
  if(!preview.exists||preview.length<100)throw Error('Preview compression failed: '+read(err));
  run([ffmpeg.fsName,'-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(Math.min(3,item.timeSpanDuration/2)),'-i',preview.fsName,'-frames:v','1','-q:v','2',poster.fsName],err);poster=new File(poster.fsName);
  if(!poster.exists||poster.length<100)throw Error('Preview poster failed: '+read(err));
  item.remove();removeFolder(raw);if(err.exists)err.remove();
 }
 function pad(n){return ('00'+n).slice(-2);}
 try{
  for(var s=0;s<sources.length;s++)if(!sources[s].file.exists)throw Error('Extract the complete ZIP first; source project missing: '+sources[s].file.fsName);
  var parent=Folder.selectDialog('Choose where to save the exported Elements library.');if(!parent)return;
  quote(parent.fsName);var stamp=(new Date()).getTime(),out=mkdir(new Folder(parent.fsName+'/Lokaya_Glass_Titles_Export_'+stamp)),ffmpeg=findFFmpeg();
  if(app.project.dirty&&!app.project.saveWithDialog())return;original=app.project.file;if(app.project.numItems&&!original)throw Error('Save the current project before running the exporter.');
  statusWindow=new Window('palette','Lokaya: Glass Titles Export');statusWindow.label=statusWindow.add('statictext',undefined,'Starting…');statusWindow.label.preferredSize=[540,30];statusWindow.show();
  for(s=0;s<sources.length;s++){
   var source=sources[s];touchedProject=true;closeDiscard();app.open(source.file);var names=[],n;
   for(n=1;n<=app.project.numItems;n++){var c=app.project.item(n),m;if(c instanceof CompItem&&(m=source.pattern.exec(c.name)))names.push({name:c.name,number:Number(m[1])});}
   names.sort(function(a,b){return a.number-b.number;});if(names.length!==source.count)throw Error('Unexpected number of final titles in '+source.file.name+': '+names.length);
   for(n=0;n<names.length;n++){
    var spec=names[n],id=source.prefix+pad(spec.number),folder=mkdir(new Folder(out.fsName+'/'+id));progress('Exporting '+id+'…');
    try{
     closeDiscard();app.open(source.file);var main=null;for(var k=1;k<=app.project.numItems;k++){c=app.project.item(k);if(c instanceof CompItem&&c.name===spec.name){if(main)throw Error('Duplicate final composition name.');main=c;}}
     if(!main)throw Error('Final composition missing.');preserveDependencies(main);collectMedia(source.file,folder);clearQueue();
     var aep=new File(folder.fsName+'/element.aep');app.project.save(aep);
     var entry={id:id,title:source.title+pad(spec.number),category:'Glass Titles',kind:'aep',entry:'element.aep',mainComp:main.name,preview:'preview.mp4',poster:'poster.jpg',sourcePack:decodeURI(source.file.name),width:main.width,height:main.height,duration:main.duration,frameRate:main.frameRate};
     write(new File(folder.fsName+'/element.json'),json(entry));prepared.push(entry);
     renderPreview(main,folder,ffmpeg);exported.push(entry);log.push('OK '+id);
    }catch(error){failedFolders.push(folder);failures.push(id+': '+String(error));log.push('FAILED '+id+': '+String(error));}
   }
  }
  write(new File(out.fsName+'/export-manifest.json'),json({version:2,prepared:prepared,category:'Glass Titles',items:exported,errors:failures}));write(new File(out.fsName+'/export-log.txt'),log.join('\n'));
  progress('Packing export ZIP…');restoreProject();for(var cleanup=0;cleanup<failedFolders.length;cleanup++)removeFolder(new Folder(failedFolders[cleanup].fsName+'/_render'));
  var archive=new File(parent.fsName+'/'+out.name+'.zip');
  if(win){var ps="Compress-Archive -LiteralPath '"+out.fsName.replace(/'/g,"''")+"' -DestinationPath '"+archive.fsName.replace(/'/g,"''")+"' -CompressionLevel Optimal";run(['powershell.exe','-NoProfile','-Command',ps]);}
  else run(['/usr/bin/ditto','-c','-k','--keepParent',out.fsName,archive.fsName]);
  if(statusWindow)statusWindow.close();
  alert('Prepared '+prepared.length+' projects; completed '+exported.length+' of 17 previews.\n'+(archive.exists?'Upload this ZIP:\n'+archive.fsName:'ZIP packing did not finish. Zip this folder and upload it:\n'+out.fsName)+(failures.length?'\nSome items failed; the ZIP includes export-log.txt.':''));
 }catch(error){try{if(statusWindow)statusWindow.close();}catch(_){}try{restoreProject();}catch(_){}alert('Lokaya export failed:\n'+String(error));}
}());
