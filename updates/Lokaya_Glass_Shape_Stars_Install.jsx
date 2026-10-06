#target aftereffects
(function(){
 var helper="\n/* lokaya-direct-title-v1 */\nfunction lkIsArrangedGlass(items){for(var i=0;i<items.length;i++)if(items[i] instanceof CompItem&&items[i].name==='Glass Object')return true;return false;}\nfunction lkDirectGlassTitle(source,items){if(!lkIsArrangedGlass(items))return source;if(source instanceof CompItem&&source.name==='Glass Object'&&source.numLayers===1){var inner=source.layer(1).source;if(inner instanceof CompItem&&/title/i.test(inner.name))return inner;throw Error('Glass Object does not contain the expected Title composition.');}return source;}\n";
 var shapeHelper="\n/* lokaya-inner-stars-v2 */\nfunction lkPrepareGlassShape(source,items){\n if(!(source instanceof CompItem)||!/^Title 0[1-4]$/.test(source.name))return;\n var isShape=false;\n for(var i=0;i<items.length;i++){var c=items[i];if(c instanceof CompItem&&c.name==='Final '+source.name){for(var j=1;j<=c.numLayers;j++)if(c.layer(j).source===source)isShape=true;}}\n if(!isShape)return;\n for(var n=1;n<=source.numLayers;n++){var layer=source.layer(n);if(layer.canSetCollapseTransformation)layer.collapseTransformation=false;}\n}\n";
 var roots=[Folder.userData.fsName+'/Adobe/CEP/extensions',Folder.appData.fsName+'/Adobe/CEP/extensions','/Library/Application Support/Adobe/CEP/extensions',Folder('~/Library/Application Support/Adobe/CEP/extensions').fsName,'C:/Program Files (x86)/Common Files/Adobe/CEP/extensions','C:/Program Files/Common Files/Adobe/CEP/extensions'];
 var done={},count=0,errors=[];
 function patch(s){
  if(s.indexOf('lokaya-inner-stars-v2')>=0)return s;
  if(s.indexOf('lokaya-direct-title-v1')>=0){var oldMarker='added = target.layers.add(source);';if(s.indexOf(oldMarker)<0)throw Error('Unsupported importer');return s.replace(oldMarker,'lkPrepareGlassShape(source,introduced);\n        '+oldMarker)+shapeHelper;}
  var marker='added = target.layers.add(source);';
  if(s.indexOf('lkElementsImport')<0||s.indexOf(marker)<0||s.indexOf('introduced')<0)throw Error('Unsupported Elements importer. No files changed.');
  // Repair an older optional bilingual helper without forcing English into RTL.
  s=s.replace(/t\.direction=ParagraphDirection\.DIRECTION_RIGHT_TO_LEFT;/g,"t.direction=/[\\u0600-\\u06ff\\u0750-\\u077f\\u08a0-\\u08ff]/.test(t.text)?ParagraphDirection.DIRECTION_RIGHT_TO_LEFT:ParagraphDirection.DIRECTION_LEFT_TO_RIGHT;");
  s=s.replace(/v\.direction!==ParagraphDirection\.DIRECTION_RIGHT_TO_LEFT/g,'v.direction!==t.direction');
  return s.replace(marker,"var lkDirectTitle = kind === 'aep' && lkIsArrangedGlass(introduced);\n        if(lkDirectTitle) source = lkDirectGlassTitle(source,introduced);\n        lkPrepareGlassShape(source,introduced);\n        "+marker+"\n        if(lkDirectTitle){if(!added.canSetCollapseTransformation)throw Error('Cannot enable Collapse Transformations for '+source.name);added.collapseTransformation=true;}")+helper+shapeHelper;
 }
 for(var ri=0;ri<roots.length;ri++){var root=new Folder(roots[ri]);if(!root.exists)continue;var dirs=root.getFiles(function(f){return f instanceof Folder;});
 for(var di=0;di<dirs.length;di++){var f=new File(dirs[di].fsName+'/jsx/elements_import.jsx');if(!f.exists||done[f.fsName])continue;done[f.fsName]=true;
 try{f.encoding='UTF-8';if(!f.open('r'))throw Error('Cannot read '+f.fsName);var s=f.read();f.close();var p=patch(s);
 if(p!==s){var backup=new File(f.fsName+'.before-direct-title.bak');if(!backup.exists&&!f.copy(backup.fsName))throw Error('Cannot back up '+f.fsName);if(!f.open('w'))throw Error('Cannot write '+f.fsName);f.write(p);f.close();}count++;
 }catch(e){errors.push(String(e));}}
 }
 if(!count){alert('Lokaya update failed. '+errors.join('\n'));return;}
 alert('Lokaya updated: double-click imports the Title composition directly with the outer star enabled; the four Glass Shapes have inner stars disabled. Restart After Effects, refresh Elements, then add the element again.'+(errors.length?'\nOther installations: '+errors.join('\n'):''));
})();
