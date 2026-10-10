"""Read official Simplified Chinese names from the user's installed Dota VPK."""
import json, re, struct, sqlite3, urllib.request
from pathlib import Path

vpk=Path('D:/steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk')
raw=vpk.read_bytes()
sig,version,size=struct.unpack_from('<III',raw)
assert sig==0x55AA1234 and version in (1,2)
header=28 if version==2 else 12
tree=raw[header:header+size]; pos=0
def string():
    global pos
    end=tree.index(b'\0',pos); value=tree[pos:end].decode(); pos=end+1; return value
tokens={}; english={}; sources=[]
while True:
    ext=string()
    if not ext: break
    while True:
        folder=string()
        if not folder: break
        while True:
            name=string()
            if not name: break
            crc,preload,archive,offset,length,term=struct.unpack_from('<IHHIIH',tree,pos); pos+=18
            prefix=tree[pos:pos+preload]; pos+=preload
            path=f'{folder}/{name}.{ext}'
            if ext!='txt' or name not in ('abilities_schinese','dota_schinese','abilities_english','dota_english','hero_names_schinese','hero_names_english'): continue
            if archive==0x7fff: data=raw[header+size+offset:header+size+offset+length]
            else:
                with vpk.with_name(f'pak01_{archive:03d}.vpk').open('rb') as f:
                    f.seek(offset); data=f.read(length)
            data=prefix+data
            try: text=data.decode('utf-16') if data.startswith((b'\xff\xfe',b'\xfe\xff')) else data.decode('utf-8-sig')
            except UnicodeDecodeError: text=data.decode('gb18030')
            pairs=re.findall(r'"([^"\r\n]+)"\s+"((?:\\.|[^"\\])*)"',text)
            for key,value in pairs:
                (tokens if 'schinese' in name else english)[key.lower()]=value
            sources.append(path)
c=sqlite3.connect('file:C:/Users/xiabao/AppData/Roaming/ability-draft-plus/dota_ad_data.db?mode=ro',uri=True)
rows=c.execute('select name,display_name from Abilities').fetchall()
heroes=c.execute('select name,display_name from Heroes').fetchall()
names={}; aliases={}; missing=[]
# A few hero spell names are absent from this game's monolithic localization
# file. Supplement them from Valve's official Dota 2 datafeed, not fan translations.
for hero_id in (90,80,92):
    url=f'https://www.dota2.com/datafeed/herodata?language=schinese&hero_id={hero_id}'
    with urllib.request.urlopen(url) as response: feed=json.load(response)
    for hero in feed['result']['data']['heroes']:
        for spell in hero.get('abilities',[]):
            tokens['dota_tooltip_ability_'+spell['name']]=spell['name_loc']
    sources.append(url)
normalize=lambda s: re.sub('[^a-z0-9]','',s.lower())
by_english={normalize(v):tokens[k] for k,v in english.items() if k in tokens and len(v)<80 and (k.startswith('dota_tooltip_ability_') and not k.endswith(('_description','_lore')))}
hero_tokens={normalize(k.removeprefix('npc_dota_hero_').removesuffix(':n')):v for k,v in tokens.items() if k.startswith('npc_dota_hero_') and k.endswith(':n') and '__' not in k}
for internal,display in rows+heroes:
    token=('dota_tooltip_ability_' if (internal,display) in rows else 'npc_dota_hero_')+internal.removeprefix('npc_dota_hero_')
    value=tokens.get(token.lower()) or tokens.get(token.lower().removesuffix('_ad')) or by_english.get(normalize(display))
    if internal=='lone_druid_entangle': value=tokens.get('dota_tooltip_ability_lone_druid_spirit_bear_entangle')
    if (internal,display) in heroes:
        value=hero_tokens.get(normalize(internal)) or hero_tokens.get(normalize({'zeus':'zuus','obsidiandestroyer':'obsidian_destroyer'}.get(internal,internal)))
    if not value: missing.append((internal,display)); continue
    names[internal]=value
    for alias in (display,english.get(token.lower()),internal):
        if alias: aliases[alias.lower()]=value
out=Path(__file__).resolve().parents[1]/'src/shared/localization/dota-zh-CN.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'names':names,'aliases':aliases,'sources':sources},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('sources',sources,'names',len(names),'missing',missing)
print({k:names.get(k) for k in ['magnataur_empower','slark_pounce','slark','dragon_knight','alchemist']})
