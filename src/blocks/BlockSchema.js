// ─── BlockSchema.js ───────────────────────────────────────────────────────────
// Single source of truth for all block types
// Fields: category, label, icon, slashLabel, hasText, hasInline, defaultMeta, placeholder
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = {
  paragraph:       { category:'text', label:'Paragraph', icon:'¶',  slashLabel:'Text',           hasText:true,  hasInline:true,  defaultMeta:{},                                              placeholder:'Write something… **bold** *italic* `code` ==highlight==' },
  heading:         { category:'text', label:'Heading', icon:'H',    slashLabel:'Heading',        hasText:true,  hasInline:false, defaultMeta:{ level:2 },                                    placeholder:'Heading…' },
  blockquote:      { category:'text', label:'Quote', icon:'❝',      slashLabel:'Quote',          hasText:true,  hasInline:true,  defaultMeta:{},                                              placeholder:'Quote…' },
  callout:         { category:'text', label:'Callout', icon:'💡',   slashLabel:'Callout',        hasText:true,  hasInline:true,  defaultMeta:{ icon:'💡' },                                  placeholder:'Callout text…' },
  callout_warning: { category:'text', label:'Warning', icon:'⚠️',   slashLabel:'Warning',        hasText:true,  hasInline:true,  defaultMeta:{ icon:'⚠️' },                                  placeholder:'Warning message…' },
  callout_tip:     { category:'text', label:'Tip', icon:'✅',       slashLabel:'Tip',            hasText:true,  hasInline:true,  defaultMeta:{ icon:'✅' },                                  placeholder:'Tip or note…' },
  callout_danger:  { category:'text', label:'Danger', icon:'🚨',    slashLabel:'Danger',         hasText:true,  hasInline:true,  defaultMeta:{ icon:'🚨' },                                  placeholder:'Critical warning…' },
  code:            { category:'text', label:'Code', icon:'</>',     slashLabel:'Code block',     hasText:true,  hasInline:false, defaultMeta:{ language:'' },                               placeholder:'// code…' },
  list_ul:         { category:'text', label:'Bullet List', icon:'•', slashLabel:'Bullet list',   hasText:true,  hasInline:false, defaultMeta:{},                                              placeholder:'Item 1\nItem 2\nItem 3' },
  list_ol:         { category:'text', label:'Numbered List', icon:'1.', slashLabel:'Numbered list', hasText:true, hasInline:false, defaultMeta:{},                                           placeholder:'First item\nSecond item' },

  image:           { category:'media', label:'Image', icon:'🖼',    slashLabel:'Image',          hasText:false, hasInline:false, defaultMeta:{ src:'', alt:'', caption:'', width:'full' }, placeholder:null },
  video:           { category:'media', label:'Video', icon:'▶',     slashLabel:'Video',          hasText:false, hasInline:false, defaultMeta:{ src:'', caption:'', embedUrl:null, platform:null }, placeholder:null },
  audio:           { category:'media', label:'Audio', icon:'🎵',    slashLabel:'Audio',          hasText:false, hasInline:false, defaultMeta:{ src:'', caption:'', embedUrl:null, platform:null }, placeholder:null },
  gallery:         { category:'media', label:'Gallery', icon:'▦',   slashLabel:'Gallery',        hasText:false, hasInline:false, defaultMeta:{ items:[], layout:'grid' },                  placeholder:null },

  embed:           { category:'embed', label:'Embed', icon:'⬡',     slashLabel:'Embed / iframe', hasText:false, hasInline:false, defaultMeta:{ src:'', height:400, caption:'' },            placeholder:null },

  table:           { category:'structure', label:'Table', icon:'⊞', slashLabel:'Table',          hasText:false, hasInline:false, defaultMeta:{ headers:['Column 1','Column 2'], rows:[['','']] }, placeholder:null },
  divider:         { category:'structure', label:'Divider', icon:'—', slashLabel:'Divider',     hasText:false, hasInline:false, defaultMeta:{},                                              placeholder:null },

  timeline_ref:    { category:'structure', label:'Timeline Event', icon:'⏱', slashLabel:'Timeline event', hasText:false, hasInline:false, defaultMeta:{ eventId:'', eventTitle:'', note:'' }, placeholder:null },
  book_citation:   { category:'structure', label:'Book Citation', icon:'📖', slashLabel:'Book citation', hasText:false, hasInline:false, defaultMeta:{ bookId:'', unitId:'', quote:'', note:'' }, placeholder:null },
};

export function getBlockDef(type)        { return SCHEMA[type] ?? SCHEMA.paragraph; }
export function getAllTypes()            { return Object.keys(SCHEMA); }
export function getTypesByCategory(cat)  { return Object.entries(SCHEMA).filter(([,d]) => d.category === cat).map(([t]) => t); }
export function defaultMeta(type)        { return { ...(SCHEMA[type]?.defaultMeta ?? {}) }; }

export default SCHEMA;