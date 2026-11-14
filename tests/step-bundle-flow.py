import asyncio,json,pathlib,subprocess,tempfile
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:4191/'
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(tempfile.mkdtemp(prefix='one-file-step-check-'))
PACK=OUT/'test.step.json'

fixture={'format':'12shagov-step-pack','version':1,'id':'step01-ui-test','stepId':'step01','title':'Проверочный пакет','subtitle':'Точка отсчёта','introduction':['Текст приложения для проверки.'],'wording':'Проверочная формулировка.','sources':[],'questions':''}
for index in range(3):
 sid='test-book-'+str(index+1)
 fixture['sources'].append({'id':sid,'markdown':'---\nid: '+sid+'\ntitle: "Проверочная книга '+str(index+1)+'"\ntopics: [denial]\n---\n\nПроверочный оригинальный текст.'})
for topic in ['addiction','denial','bottom','powerlessness','unmanageability','reservations','surrender']:
 fixture['questions']+='# '+topic+'\n\n'+'\n\n'.join(str(i+1)+'. Вопрос '+str(i+1)+' по теме '+topic+'?' for i in range(10))+'\n\n'
PACK.write_text(json.dumps(fixture,ensure_ascii=False))

async def main():
 server=subprocess.Popen(['python3','-m','http.server','4191','--bind','127.0.0.1','--directory',str(ROOT/'www')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  async with async_playwright() as p:
   b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   ctx=await b.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.add_init_script("localStorage.setItem('twelve-steps:intro',JSON.stringify({auto:false,sound:false}))")
   await page.goto(BASE+'#/step/1/materials',wait_until='networkidle')
   await page.locator('input[type=password]').nth(0).fill('testing one file pack phrase')
   await page.locator('input[type=password]').nth(1).fill('testing one file pack phrase')
   await page.get_by_role('button',name='Создать тетрадь',exact=True).click()
   await page.wait_for_selector('.bundle-loader')
   await page.goto(BASE+'#/step/1/journal/denial')
   await page.get_by_role('textbox',name='Новая запись',exact=True).fill('Моя запись до установки пакета')
   await page.wait_for_timeout(800)
   await page.goto(BASE+'#/step/1/materials')
   await page.get_by_role('button',name='Добавить книгу',exact=True).click()
   await page.get_by_role('textbox',name='Название источника',exact=True).fill('Мой конспект')
   await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).fill('Личная проверочная заметка в источнике.')
   await page.get_by_role('button',name='Сохранить книгу в Источниках',exact=True).click()
   await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
   await page.get_by_label('Пакет шага одним файлом').set_input_files(str(PACK))
   await page.get_by_role('button',name='Установить материалы шага',exact=True).wait_for(state='visible')
   await page.get_by_role('button',name='Установить материалы шага',exact=True).click()
   await page.wait_for_selector('.bundle-hero')
   assert await page.locator('.bundle-book-card').count()==3
   assert await page.locator('.bundle-topics>a').count()==7
   assert await page.locator('.bundle-facts strong').all_text_contents()==['3','70','7']
   await page.evaluate('document.fonts.ready')
   await page.locator('.bundle-hero').screenshot(path=str(OUT/'step01-cover.png'))
   await page.screenshot(path=str(OUT/'step01-home.png'))
   await page.goto(BASE+'#/step/1/sources')
   assert await page.locator('.step-engine a[href*="/sources/"]').count()==4
   await page.goto(BASE+'#/step/1/journal/denial')
   assert await page.locator('textarea').input_value()=='Моя запись до установки пакета'
   await page.goto(BASE+'#/step/1/journal')
   links=page.locator('.step-journal a[href*="/journal/lit-ownerq-"]')
   assert await links.count()==70
   await links.first.click()
   target=await page.evaluate('location.hash')
   await page.get_by_role('textbox',name='Новая запись',exact=True).fill('Ответ к вопросу из пакета')
   await page.wait_for_timeout(800)
   await page.goto(BASE+'#/step/1/materials')
   await page.get_by_label('Пакет шага одним файлом').set_input_files(str(PACK))
   await page.get_by_role('button',name='Установить материалы шага',exact=True).click()
   await page.wait_for_selector('.bundle-hero')
   assert await page.locator('.bundle-book-card').count()==3
   await page.goto(BASE+target)
   assert await page.locator('textarea').input_value()=='Ответ к вопросу из пакета'
   await page.goto(BASE+'#/step/1/materials')
   wrong=json.loads(PACK.read_text());wrong['stepId']='step02'
   await page.get_by_label('Пакет шага одним файлом').set_input_files({'name':'wrong.step.json','mimeType':'application/json','buffer':json.dumps(wrong,ensure_ascii=False).encode()})
   await page.get_by_text('Этот пакет предназначен для другого шага',exact=True).wait_for()
   assert await page.get_by_role('button',name='Установить материалы шага',exact=True).is_hidden()
   await page.evaluate('navigator.serviceWorker.ready');await page.wait_for_function('!!navigator.serviceWorker.controller')
   await ctx.set_offline(True)
   await page.reload(wait_until='networkidle')
   assert await page.locator('.bundle-hero').count()==0
   assert await page.get_by_label('Пакет шага одним файлом').count()==0
   await page.locator('input[type=password]').fill('testing one file pack phrase')
   await page.get_by_role('button',name='Открыть тетрадь',exact=True).click()
   await page.wait_for_selector('.bundle-loader')
   await page.goto(BASE+'#/step/1')
   await page.wait_for_selector('.bundle-hero')
   assert await page.locator('.bundle-book-card').count()==3
   names=await page.evaluate("StepEngine.vault.names('')")
   assert names.count('materials:step01')==1
   await page.goto(BASE+target)
   assert await page.locator('textarea').input_value()=='Ответ к вопросу из пакета'
   for width in [320,390,768]:
    await page.set_viewport_size({'width':width,'height':844});await page.goto(BASE+'#/step/1');await page.wait_for_selector('.bundle-hero');assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   assert not errors,errors
   print(json.dumps({'sources':3,'questions':70,'topics':7,'reimport_no_duplicates':True,'existing_notes_preserved':True,'offline_unlock':True,'atomic_bundle_record':True,'errors':errors},ensure_ascii=False))
   await ctx.close();await b.close()
 finally:server.terminate();server.wait()
asyncio.run(main())
