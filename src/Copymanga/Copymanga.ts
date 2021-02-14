import {
  Source,
  Manga,
  Chapter,
  ChapterDetails,
  HomeSection,
  SearchRequest,
  LanguageCode,
  MangaStatus,
  MangaUpdates,
  PagedResults,
  SourceInfo,
  TagSection,
  RequestHeaders,
  TagType,
} from "paperback-extensions-common"

const COPYMANGA_API_BASE = "https://www.copymanga.com"

export const CopymangaInfo: SourceInfo = {
  version: "1.0.0",
  name: "Copymanga",
  icon: "icon.png",
  author: "lixin9311",
  authorWebsite: "https://github.com/lixin9311",
  description: "Extension that pulls manga from copymanga",
  language: LanguageCode.CHINEESE,
  hentaiSource: false,
  websiteBaseURL: COPYMANGA_API_BASE,
  sourceTags: [
    {
      text: 'Recommended',
      type: TagType.BLUE,
    },
  ],
}

export class Copymanga extends Source {
  globalRequestHeaders(): RequestHeaders {
    return {"X-Forwarded-For": "119.118.219.88"}
  }

  async getMangaDetails(mangaId: string): Promise<Manga> {

    let request = createRequestObject({
      metadata: { mangaId },
      url: COPYMANGA_API_BASE + "/comic/" + mangaId,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"}
    })

    let response = await this.requestManager.schedule(request, 1)
    let $ = this.cheerio.load(response.data)

    let titles: string[] = []
    let author

    let tags: TagSection[] = [createTagSection({ id: '0', label: 'genre', tags: [] })]
    let status: MangaStatus = MangaStatus.ONGOING   // Default to ongoing
    let views
    let update
    let lang = LanguageCode.CHINEESE
    let image = $('img', $('div.comicParticulars-left-img')).attr('data-src')
    let objContext = $('li', $('ul', $('div.comicParticulars-title-right'))).toArray()
    let desc = $('p.intro', $('div.comicParticulars-synopsis')).text().trim();
    for (let i = 0; i < objContext.length; i++) {
      let currObj = $(objContext[i]);
      switch (i) {
          case 0: 
              let title = $('h6', currObj).text().trim()
              titles.push(title)
              break
          case 1:
              let otherTitles = $('p[class=comicParticulars-right-txt]', currObj).text().trim().split(',')
              otherTitles.forEach((item) => titles.push(item))
              break
          case 2:
              author = $('a', currObj).text().trim()
              break
          case 3:
              let viewsStr = $('p', currObj).text().trim()
              let multiplier = 1
              if (viewsStr.endsWith('K')) {
                  multiplier = 1000
              }
              views = parseFloat(viewsStr) * multiplier
              break
          case 4:
              update = $('span.comicParticulars-right-txt', currObj).text().trim()
              break
          case 5:
              let statusStr = $('span.comicParticulars-right-txt', currObj).text().trim()
              if (statusStr === '連載中') {
                status = MangaStatus.ONGOING
              } else if (statusStr === '已完結') {
                status = MangaStatus.COMPLETED
              }
              break
          case 6: {
              let tagsH = $('a', currObj).toArray()
              for (let j = 0; j < tagsH.length; j++) {
                  let id = $(tagsH[j]).attr('href')?.replace("/comics?theme=", "")
                  let label = $(tagsH[j]).text().trim()
                  tags[0].tags.push(createTag({label: label, id: id!}))
              }
              break
          }
      }
    }

    return createManga({
      id: mangaId,
      titles: titles,
      image: image!,
      status: status,
      desc: desc,
      tags: tags,
      author: author,
      rating: 5,
      langFlag: lang,
      langName: lang,
      views: views,
      lastUpdate: update,
      hentai: false            // This is an 18+ source
    })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    let request = createRequestObject({
      metadata: { mangaId },
      url: COPYMANGA_API_BASE + "/comic/" + mangaId,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"}
    })

    let response = await this.requestManager.schedule(request, 1)
    let $ = this.cheerio.load(response.data)

    let disposable = $('div.disposableData').attr('disposable')!
    let disposablePass = $('div.disposablePass').attr('disposable')!
    let decrypted = await this.decrypt(disposable, disposablePass)
    let jresult = JSON.parse(decrypted);
    let chapterGroups: { [key: string]: any[] } = jresult.default.groups

    let chapters = []
    for (let key in chapterGroups) {
          let groupName = key
          let group = chapterGroups[key]
          for (let i = 0; i < group.length; i++) {
            let chapter = group[i]
            chapters.push(
              createChapter({
                id: chapter.uuid,
                mangaId: mangaId,
                chapNum: parseInt(chapter.name),
                langCode: LanguageCode.ENGLISH,
                name: chapter.name,
                group: groupName,
                time: new Date(chapter.datetime_created),
              })
            )
          }
    }
    return chapters
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const request = createRequestObject({
      url: `${COPYMANGA_API_BASE}/comic/${mangaId}/chapter/${chapterId}`,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"}
    })

    let response = await this.requestManager.schedule(request, 1)
    let $ = this.cheerio.load(response.data)

    let disposable = $('div.disposableData').attr('disposable')!
    let disposablePass = $('div.disposablePass').attr('disposable')!
    let decrypted = await this.decrypt(disposable, disposablePass)
    let jresult : any[] = JSON.parse(decrypted);
    let pages: string[] = []
    for (let i = 0; i < jresult.length; i++) {
      pages.push(jresult[i].url)
    }

    return createChapterDetails({
      id: chapterId,
      longStrip: false,
      mangaId: mangaId,
      pages: pages,
    })
  }

  async searchRequest(searchQuery: SearchRequest, metadata: any): Promise<PagedResults> {
    const request = createRequestObject({
      url: `${COPYMANGA_API_BASE}/api/kb/web/search/count?format=json&limit=10&offset=0&platform=2&q=${searchQuery.title}`,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"},
    })

    const data = await this.requestManager.schedule(request, 1)

    let result = JSON.parse(data.data)
    let list: any[] = result.results.comic.list

    let tiles = list.map((comic) => {
      return createMangaTile({
        id: comic.path_word,
        image: comic.cover,
        title: createIconText({ text: comic.name as string }),
        subtitleText: createIconText({ text: comic.author[0].name as string }),
      })
    })

    return createPagedResults({
      results: tiles
    })
  }

  async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {

    // Send the empty homesection back so the app can preload the section
    var homeSection = createHomeSection({ id: "pop", title: "热门" , view_more: true })
    sectionCallback(homeSection)

    const request = createRequestObject({
      url: `${COPYMANGA_API_BASE}/comics?ordering=-popular&offset=0&limit=10`,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"},
    })

    const response = await this.requestManager.schedule(request, 1)

    let $ = this.cheerio.load(response.data)
    var list = $('div.exemptComicItem').toArray();
  
    let tiles = list.map((elem) => {
      let item = $(elem)
      return createMangaTile({
        id: $('a', item).attr('href')!.trim().replace('/comic/', ''),
        image:  $('img.lazyload', item).attr('data-src')!.trim(),
        title: createIconText({ text: $('p.twoLines', item).text().trim() }),
        subtitleText: createIconText({ text: $('a', $('span.exemptComicItem-txt-span', item)).text().trim()}),
      })
    })

    homeSection.items = tiles
    sectionCallback(homeSection)
  }

  getMangaShareUrl(mangaId: string) {
    return `${COPYMANGA_API_BASE}/comic/${mangaId}/`
  }

  fromHexString (hexString: string): Uint8Array {
    return new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  }

  async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults | null> {
    let offset = 0
    if (metadata['offset']) {
      offset = metadata['offset'] as number
    }
    const request = createRequestObject({
      url: `${COPYMANGA_API_BASE}/comics?ordering=-popular&offset=${offset}&limit=10`,
      method: "GET",
      headers: {"X-Forwarded-For": "119.118.219.88"},
    })
    const response = await this.requestManager.schedule(request, 1)

    let $ = this.cheerio.load(response.data)
    var list = $('div.exemptComicItem').toArray();
  
    let tiles = list.map((elem) => {
      let item = $(elem)
      return createMangaTile({
        id: $('a', item).attr('href')!.trim().replace('/comic/', ''),
        image:  $('img.lazyload', item).attr('data-src')!.trim(),
        title: createIconText({ text: $('p.twoLines', item).text().trim() }),
        subtitleText: createIconText({ text: $('a', $('span.exemptComicItem-txt-span', item)).text().trim()}),
      })
    })
    metadata['offset'] = offset + 10
    return createPagedResults({results: tiles, metadata: metadata})
  }

  async decrypt(disposableData: string, disposablePass: string): Promise<string> {
    let prePart = disposableData.substring(0,16);
    let iv = new TextEncoder().encode(prePart);
    let postPart = disposableData.substring(16);
    const key = await crypto.subtle.importKey(           
        "raw",
        new TextEncoder().encode(disposablePass),                                                 
        "AES-CBC",
        true,
        ["encrypt", "decrypt"]
    )
    const aes = {
        name: "AES-CBC",
        iv: iv,
        tagLength: 128
    };
    const dec = await crypto.subtle.decrypt(aes, key, this.fromHexString(postPart))
    return new TextDecoder("utf-8").decode(dec);
  }
}