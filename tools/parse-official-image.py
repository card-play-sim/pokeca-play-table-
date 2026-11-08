"""Parse official detail HTML; IDs are supplied, image paths are observed only."""
from html.parser import HTMLParser
import json
import re
import sys
from urllib.parse import urljoin, urlsplit


class Detail(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[];self.names=[];self.images=[];self.numbers=[];self.sets=[];self.canonical=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);classes=a.get('class','').split()
        left='LeftBox' in classes or any(x[1] for x in self.stack)
        sub='subtext' in classes or any(x[2] for x in self.stack)
        name=tag=='h1' and 'Heading1' in classes
        if name:self.names.append('')
        if 'subtext' in classes:self.numbers.append('')
        if tag=='img':
            if left and 'fit' in classes:self.images.append(a.get('src',''))
            if sub and 'img-regulation' in classes:self.sets.append(a.get('alt',''))
        if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href',''))
        if tag not in ('img','br','hr','meta','input','link','source','wbr'):
            self.stack.append((tag,left,sub,name))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:
                del self.stack[i:];break
    def handle_data(self,data):
        if any(x[0] in ('script','style','template') for x in self.stack):return
        if self.names and any(x[3] for x in self.stack):self.names[-1]+=data
        if self.numbers and any(x[2] for x in self.stack):self.numbers[-1]+=data


def parse(html,ident,name,expected=None):
    def hold(reason):return dict(status='HOLD',reason=reason)
    if not re.fullmatch(r'[0-9]+',str(ident)):return hold('INVALID_ID')
    p=Detail();p.feed(html)
    if len(p.names)!=1 or p.names[0].strip()!=name:return hold('CARD_NAME_MISMATCH_OR_AMBIGUOUS')
    if len(p.images)!=1 or len(p.numbers)!=1 or len(p.sets)!=1:return hold('PRINT_EVIDENCE_MISSING_OR_AMBIGUOUS')
    url=urljoin('https://www.pokemon-card.com/',p.images[0]);u=urlsplit(url)
    if u.scheme!='https' or u.netloc!='www.pokemon-card.com' or u.query or u.fragment or not re.fullmatch(r'/assets/images/card_images/large/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|webp)',u.path,re.I):return hold('INVALID_IMAGE_ORIGIN_OR_PATH')
    if not re.search(r'/0*'+re.escape(str(ident))+r'_[A-Za-z0-9_]+\.(?:jpg|jpeg|png|webp)$',u.path,re.I):return hold('IMAGE_ID_MISMATCH')
    number=re.sub(r'\s+','',p.numbers[0]);set_code=p.sets[0].strip()
    if not number or not set_code:return hold('PRINT_EMPTY')
    for canonical in p.canonical:
        canonical_url=urlsplit(urljoin('https://www.pokemon-card.com/',canonical))
        if canonical_url.scheme!='https' or canonical_url.netloc!='www.pokemon-card.com' or canonical_url.query or canonical_url.fragment or not re.fullmatch(r'/card-search/details\.php/card/'+re.escape(str(ident))+r'(?:/regu/XY)?/?',canonical_url.path):return hold('CANONICAL_ID_MISMATCH')
    if expected and (expected.get('cardNumber') and re.sub(r'\s+','',expected['cardNumber'])!=number or expected.get('set') and expected['set']!=set_code):return hold('PRINT_MISMATCH')
    return dict(status='CANDIDATE',imageSourceUrl=url,cardNumber=number,set=set_code,name=name,officialCardId=str(ident))


class Search(HTMLParser):
    def __init__(self,ident):
        super().__init__(convert_charrefs=True)
        self.ident=str(ident);self.found=False
    def handle_starttag(self,tag,attrs):
        if tag!='a':return
        u=urlsplit(urljoin('https://www.pokemon-card.com/',dict(attrs).get('href','')))
        if (u.scheme=='https' and u.netloc=='www.pokemon-card.com' and not u.query and not u.fragment
            and re.fullmatch(r'/card-search/details\.php/card/'+re.escape(self.ident)+r'(?:/regu/XY)?/?',u.path)):
            self.found=True


if __name__=='__main__':
    a=json.load(sys.stdin)
    if a.get('mode')=='search':
        p=Search(a['id']);p.feed(a['html']);print(json.dumps({'found':p.found}))
    else:print(json.dumps(parse(a['html'],a['id'],a['name'],a.get('expected')),ensure_ascii=False))
