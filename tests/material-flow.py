import asyncio,json,pathlib,re,tempfile,zipfile,subprocess,os,urllib.request,time
from playwright.async_api import async_playwright
BASE=os.environ.get('STEP_TEST_URL','http://127.0.0.1:4185/')
OUT=pathlib.Path(tempfile.mkdtemp(prefix='step-material-test-'))
ATT=OUT
# Synthetic public-domain fixtures: the test never needs the owner's books.
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
stream=b'BT /F1 18 Tf 50 700 Td (Offline original test.) Tj ET'
objects.append(b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream')
pdf=bytearray(b'%PDF-1.4\n');offsets=[0]
for i,obj in enumerate(objects,1):
 offsets.append(len(pdf));pdf.extend(str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n')
xref=len(pdf);pdf.extend(b'xref\n0 6\n0000000000 65535 f \n')
for offset in offsets[1:]:pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF')
(ATT/'offline.pdf').write_bytes(pdf)
with zipfile.ZipFile(ATT/'offline.epub','w') as z:
 z.writestr('mimetype','application/epub+zip')
 z.writestr('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
 z.writestr('OEBPS/content.opf','<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>')
 z.writestr('OEBPS/chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Offline EPUB</title></head><body><h1>Offline EPUB original</h1><p>'+('Original text. '*100)+'<img src="https://example.invalid/tracker"/></p><script>window.BAD=true</script></body></html>')

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  context=await browser.new_context(viewport={'width':390,'height':844})
  page=await context.new_page();errors=[];remote=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:remote.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith('blob:') else None)
  await page.add_init_script("localStorage.setItem('twelve-steps:intro',JSON.stringify({auto:false,sound:false}))")
  await page.goto(BASE+'#/step/1')
  await page.get_by_role('link',name='Загрузить материалы в шаг',exact=True).click()
  await page.locator('input[type=password]').nth(0).fill('test material phrase 2026')
  await page.locator('input[type=password]').nth(1).fill('test material phrase 2026')
  await page.get_by_role('button',name='Создать тетрадь',exact=True).click()
  await page.wait_for_selector('.material-slot')
  assert await page.locator('.material-slot').count()==3
  await page.get_by_role('button',name='Добавить формулировку',exact=True).click()
  await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).fill('Моя проверочная формулировка первого шага.')
  await page.get_by_role('button',name='Сохранить формулировку',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1')
  assert await page.get_by_text('Моя проверочная формулировка первого шага.',exact=True).count()==1
  await page.goto(BASE+'#/step/1/materials')
  await page.get_by_role('button',name='Добавить вопросы',exact=True).click()
  await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).fill('# Отрицание\n\n1. Какой конкретный случай я заметил?\n\n# Бессилие\n\n1. Что я пробовал изменить?')
  await page.get_by_role('button',name='Сохранить вопросы в Тетради',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1/journal')
  await page.get_by_role('link',name='Какой конкретный случай я заметил?',exact=True).click()
  await page.get_by_role('textbox',name='Новая запись',exact=True).fill('Проверочная личная запись, не публиковать.')
  await page.wait_for_timeout(800)
  await page.goto(BASE+'#/step/1/materials')
  await page.get_by_role('button',name='Добавить книгу',exact=True).click()
  await page.get_by_label('Файл для Оригиналы книг').set_input_files({'name':'my-book.md','mimeType':'text/markdown','buffer':'---\nid: synthetic-book\ntitle: "Моя книга"\ntopics: [denial]\n---\n\nОригинальный проверочный абзац.\n\n<script>window.BAD=true</script>'.encode()})
  await page.get_by_role('button',name='Прочитать выбранный файл',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value.length>20")
  await page.get_by_role('button',name='Сохранить книгу в Источниках',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1/sources/synthetic-book')
  await page.wait_for_selector('.step-reader')
  assert await page.evaluate('window.BAD===undefined')
  await page.reload(wait_until='networkidle')
  assert await page.locator('.step-reader').count()==0
  await page.goto(BASE+'#/step/1/materials')
  await page.locator('input[type=password]').fill('test material phrase 2026')
  await page.get_by_role('button',name='Открыть тетрадь',exact=True).click()
  await page.wait_for_selector('.material-slot')
  assert await page.get_by_role('link',name='Моя книга',exact=True).count()==1
  await page.goto(BASE+'#/step/1/journal')
  await page.get_by_role('link',name='Какой конкретный случай я заметил? · записей: 1',exact=True).click()
  assert (await page.locator('textarea').input_value())=='Проверочная личная запись, не публиковать.'
  await page.goto(BASE+'#/step/1/materials')
  await page.get_by_role('button',name='Добавить вопросы',exact=True).click()
  await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).fill('# Бессилие\n\n1. Что я пробовал изменить?\n2. Новый вопрос?')
  await page.get_by_role('button',name='Сохранить вопросы в Тетради',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1/journal')
  assert await page.get_by_text('Ответы к прежним вопросам',exact=True).count()==1
  await page.get_by_role('link',name='Какой конкретный случай я заметил? · записей: 1',exact=True).click()
  assert await page.locator('textarea').input_value()=='Проверочная личная запись, не публиковать.'
  await page.evaluate('navigator.serviceWorker.ready')
  await page.wait_for_function('!!navigator.serviceWorker.controller')
  await context.set_offline(True)
  await page.goto(BASE+'#/step/1/materials')
  await page.get_by_role('button',name='Добавить книгу',exact=True).click()
  white=ATT/'offline.pdf'
  await page.get_by_label('Файл для Оригиналы книг').set_input_files(str(white))
  await page.get_by_label('PDF: со страницы').fill('1')
  await page.get_by_label('PDF: по страницу').fill('1')
  await page.get_by_role('button',name='Прочитать выбранный файл',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value.length>20",timeout=30000)
  pdf_text=await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).input_value()
  assert 'Offline original test.' in pdf_text,pdf_text[:100]
  await page.get_by_role('button',name='Сохранить книгу в Источниках',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1/materials')
  await page.get_by_role('button',name='Добавить книгу',exact=True).click()
  epub=ATT/'offline.epub'
  await page.get_by_label('Файл для Оригиналы книг').set_input_files(str(epub))
  await page.get_by_role('button',name='Прочитать выбранный файл',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value.length>1000",timeout=30000)
  epub_text=await page.get_by_role('textbox',name='Предпросмотр текста',exact=True).input_value()
  assert 'Offline EPUB original' in epub_text
  await page.get_by_role('button',name='Сохранить книгу в Источниках',exact=True).click()
  await page.wait_for_function("document.querySelector('.material-editor textarea').value===''")
  await page.goto(BASE+'#/step/1/materials')
  await page.reload(wait_until='networkidle')
  await page.locator('input[type=password]').fill('test material phrase 2026')
  await page.get_by_role('button',name='Открыть тетрадь',exact=True).click()
  await page.wait_for_selector('.material-slot')
  assert await page.get_by_role('button',name='Удалить книгу',exact=True).count()==3
  await page.evaluate('window.scrollTo(0,0)')
  await page.screenshot(path=str(OUT/'material-slots.png'),full_page=True)
  assert await page.get_by_text('Добавлено: 3',exact=True).count()==1
  for width in [320,390,768]:
   await page.set_viewport_size({'width':width,'height':844});assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
  storage=await page.evaluate('JSON.stringify(localStorage)')
  assert 'Проверочная личная запись' not in storage and 'Моя проверочная формулировка' not in storage
  assert not errors,errors
  assert not remote,remote
  print(json.dumps({'pdf_characters':len(pdf_text),'epub_characters':len(epub_text),'errors':errors,'network_requests_outside_app':remote,'persistence_and_archive':True,'offline_import':True},ensure_ascii=False))
  await context.close();await browser.close()
if __name__=='__main__':
 server=None
 try:
  if 'STEP_TEST_URL' not in os.environ:
   server=subprocess.Popen(['python3','-m','http.server','4185','--bind','127.0.0.1','--directory',str(pathlib.Path(__file__).resolve().parents[1]/'www')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   for attempt in range(50):
    try:urllib.request.urlopen(BASE,timeout=.2);break
    except Exception:time.sleep(.1)
  asyncio.run(main())
 finally:
  if server:server.terminate();server.wait()

