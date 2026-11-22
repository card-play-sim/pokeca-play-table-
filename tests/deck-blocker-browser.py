"""Mobile browser regression for the collapsed exact-print blocker list.

Uses synthetic counts selected from the actual catalog; does not read any
user's real deck or assert that these are the user's sixteen missing cards.
"""
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright
from test_fixed_deck_browser_images import session_ca_args

def run(base):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=session_ca_args())
        page = browser.new_page(viewport={"width":320,"height":700},is_mobile=True,has_touch=True)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(base+"/deck-builder.html")
        expect(page.locator("#save")).to_be_enabled(timeout=60000)
        ids=page.evaluate("""async () => {
          const {cards,plans}=await PokecaSavedDecks.loadCatalog();
          // Pick distinct non-ACE names, so this 16-card fixture is not also
          // invalid under composition rules (the purpose is effect coverage).
          const names=new Set(),uncovered=[];
          for(const card of cards.values()){
            if(card.category!=='goods'||plans.has(card.id)||card.aceSpec===true||names.has(card.name))continue;
            uncovered.push(card); names.add(card.name);
            if(uncovered.length===16)break;
          }
          if(uncovered.length!==16)throw Error('not enough unconnected official print fixtures');
          const values=Object.fromEntries(uncovered.map(card=>[card.id,1]));
          sessionStorage.setItem('pokeca.deck-draft.v1:new',JSON.stringify({
            id:'mobile-diagnosis-fixture',name:'おまつり・診断検証',cards:values,blocked:[]
          }));
          return uncovered.map(card=>({id:card.id,name:card.name}));
        }""")
        page.reload()
        expect(page.locator("#save")).to_be_enabled(timeout=60000)
        expect(page.locator("#message")).to_contain_text("対戦未対応のカードが16種類")
        panel=page.locator("#battle-diagnostics")
        expect(panel).to_be_visible()
        expect(page.locator("#battle-diagnostics-title")).to_contain_text("16種類")
        panel.locator("summary").click()
        expect(page.locator("#battle-diagnostics-items li")).to_have_count(16)
        for card in ids:
            expect(page.locator("#battle-diagnostics-items")).to_contain_text("ID "+card['id'])
        # The clipboard action is local and only runs when explicitly clicked.
        page.evaluate("""() => {
          Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
            writeText:async value=>{window.__diagnosticCopied=value}
          }});
        }""")
        page.locator("#copy-battle-diagnostics").click()
        page.wait_for_function("typeof window.__diagnosticCopied === 'string'")
        report=page.evaluate("window.__diagnosticCopied")
        assert "おまつり・診断検証" in report
        assert "未対応・未照合: 16種類" in report
        assert "全カード構成（公式印刷版IDと枚数）:" in report
        for card in ids:
            assert "[ID "+card['id']+"]" in report
        assert not errors, errors
        browser.close()
        print("PASS mobile 16 exact-print blockers displayed and clipboard report generated on explicit click")

if __name__=="__main__":
    server=ThreadingHTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler)
    try:
        threading.Thread(target=server.serve_forever,daemon=True).start()
        run(f"http://127.0.0.1:{server.server_port}")
    finally:
        server.shutdown()
