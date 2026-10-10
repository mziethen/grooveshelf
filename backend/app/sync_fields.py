"""Strict interpretation of explicitly mapped personal collection fields."""
from fastapi import HTTPException

FIELDS = ('media_condition','sleeve_condition','notes')
GRADES = {'Mint (M)':'M','Near Mint (NM or M-)':'NM','Very Good Plus (VG+)':'VG+',
          'Very Good (VG)':'VG','Good Plus (G+)':'G+','Good (G)':'G','Fair (F)':'F','Poor (P)':'P'}


def field_definitions(data):
    fields=data.get('fields')
    if not isinstance(fields,list) or len(fields)>100:
        raise HTTPException(502,'Discogs collection field definitions are incomplete.')
    result={}
    for field in fields:
        if not isinstance(field,dict) or type(field.get('id')) is not int or field['id']<1 or field['id'] in result:
            raise HTTPException(502,'Discogs returned invalid or duplicate field IDs.')
        name,kind,options=field.get('name'),field.get('type'),field.get('options',[])
        if not isinstance(name,str) or not name or len(name)>200 or not isinstance(kind,str) or len(kind)>100 or not isinstance(options,list) or len(options)>200 or any(not isinstance(v,str) or len(v)>10000 for v in options):
            raise HTTPException(502,'Discogs collection field definitions are invalid.')
        result[field['id']]={'id':field['id'],'name':name,'type':kind,'options':options}
    return result


def note_values(notes):
    if not isinstance(notes,list):return {}
    result={};duplicates=set()
    for note in notes:
        if not isinstance(note,dict) or type(note.get('field_id')) is not int:continue
        id=note['field_id']
        if id in result:duplicates.add(id)
        result[id]=note.get('value')
    return {id:value for id,value in result.items() if id not in duplicates and isinstance(value,str)}


def value_for(field, value):
    if not isinstance(value,str):raise ValueError('Missing field value')
    if field=='notes':
        if len(value)>10000:raise ValueError('Notes exceed the local limit')
        return value
    cleaned=value.strip()
    if not cleaned:return None
    grade=GRADES.get(cleaned,cleaned)
    allowed=set(GRADES.values()) | ({'Generic','No Cover'} if field=='sleeve_condition' else set())
    if grade not in allowed:raise ValueError('Unsupported condition')
    return grade
