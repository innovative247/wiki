const Model = require('objection').Model
const _ = require('lodash')
const { DateTime, Duration } = require('luxon')

/* global WIKI */

/**
 * Page History model
 */
module.exports = class PageHistory extends Model {
  static get tableName() { return 'pageHistory' }

  static get jsonSchema () {
    return {
      type: 'object',
      required: ['path', 'title'],

      properties: {
        id: {type: 'integer'},
        path: {type: 'string'},
        hash: {type: 'string'},
        title: {type: 'string'},
        description: {type: 'string'},
        isPublished: {type: 'boolean'},
        publishStartDate: {type: 'string'},
        publishEndDate: {type: 'string'},
        content: {type: 'string'},
        contentType: {type: 'string'},

        createdAt: {type: 'string'},
        updatedAt: {type: 'string'}
      }
    }
  }

  static get relationMappings() {
    return {
      tags: {
        relation: Model.ManyToManyRelation,
        modelClass: require('./tags'),
        join: {
          from: 'pageHistory.id',
          through: {
            from: 'pageHistoryTags.pageId',
            to: 'pageHistoryTags.tagId'
          },
          to: 'tags.id'
        }
      },
      page: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./pages'),
        join: {
          from: 'pageHistory.pageId',
          to: 'pages.id'
        }
      },
      author: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./users'),
        join: {
          from: 'pageHistory.authorId',
          to: 'users.id'
        }
      },
      editor: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./editors'),
        join: {
          from: 'pageHistory.editorKey',
          to: 'editors.key'
        }
      },
      locale: {
        relation: Model.BelongsToOneRelation,
        modelClass: require('./locales'),
        join: {
          from: 'pageHistory.localeCode',
          to: 'locales.code'
        }
      }
    }
  }

  $beforeUpdate() {
    this.updatedAt = new Date().toISOString()
  }
  $beforeInsert() {
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
  }

  /**
   * Create Page Version
   */
  static async addVersion(opts) {
    await WIKI.models.pageHistory.query().insert({
      pageId: opts.id,
      authorId: opts.authorId,
      content: opts.content,
      contentType: opts.contentType,
      description: opts.description,
      editorKey: opts.editorKey,
      hash: opts.hash,
      isPrivate: (opts.isPrivate === true || opts.isPrivate === 1),
      isPublished: (opts.isPublished === true || opts.isPublished === 1),
      localeCode: opts.localeCode,
      path: opts.path,
      publishEndDate: opts.publishEndDate || '',
      publishStartDate: opts.publishStartDate || '',
      title: opts.title,
      action: opts.action || 'updated',
      versionDate: opts.versionDate,
      adminApproval: opts.adminApproval
    })
  }

  /**
   * Modify Page Version
   */
  static async modifyVersion(opts) {
    await WIKI.models.pageHistory.query().update({
      content: opts.content,
      contentType: opts.contentType,
      description: opts.description,
      editorKey: opts.editorKey,
      isPrivate: (opts.isPrivate === true || opts.isPrivate === 1),
      isPublished: (opts.isPublished === true || opts.isPublished === 1),
      localeCode: opts.localeCode,
      path: opts.path,
      publishEndDate: opts.publishEndDate || '',
      publishStartDate: opts.publishStartDate || '',
      title: opts.title,
      action: opts.action || 'updated',
      versionDate: opts.versionDate
    }).where('id', opts.pageHistoryId)
  }

  /**
   * Approve the New Page Version
   */
  static async approveNewPageVersion(opts) {
    const newPageData = await WIKI.models.pageHistory.query().findById(opts.id)

    // -> Create page
    const pageRecord = await WIKI.models.pages.query().insert({
      authorId: newPageData.authorId,
      content: newPageData.content,
      render: newPageData.content,
      creatorId: newPageData.authorId,
      contentType: newPageData.contentType,
      description: newPageData.description,
      editorKey: newPageData.editorKey,
      hash: newPageData.hash,
      isPrivate: newPageData.isPrivate,
      isPublished: newPageData.isPublished,
      localeCode: newPageData.localeCode,
      path: newPageData.path,
      publishEndDate: newPageData.publishEndDate || '',
      publishStartDate: newPageData.publishStartDate || '',
      title: newPageData.title,
      toc: '[]',
      extra: newPageData.extra
    })
    const page = await WIKI.models.pages.getPageFromDb({
      path: newPageData.path,
      locale: newPageData.locale,
      userId: opts.user.id,
      isPrivate: newPageData.isPrivate
    })

    // -> Save Tags
    if (newPageData.tags && newPageData.tags.length > 0) {
      await WIKI.models.tags.associateTags({ tags: newPageData.tags, page })
    }

    // -> Render page to HTML
    await WIKI.models.pages.renderPage(page)

    // -> Rebuild page tree
    await WIKI.models.pages.rebuildTree()

    // -> Add to Search Index
    const pageContents = await WIKI.models.pages.query().findById(page.id).select('render')
    page.safeContent = WIKI.models.pages.cleanHTML(pageContents.render)
    await WIKI.data.searchEngine.created(page)

    // -> Add to Storage
    if (!opts.skipStorage) {
      await WIKI.models.storage.pageEvent({
        event: 'created',
        page
      })
    }

    // -> Reconnect Links
    await WIKI.models.pages.reconnectLinks({
      locale: page.localeCode,
      path: page.path,
      mode: 'create'
    })

    // -> Get latest updatedAt
    page.updatedAt = await WIKI.models.pages.query().findById(page.id).select('updatedAt').then(r => r.updatedAt)

    // -> Create record in pageHistory
    await WIKI.models.pageHistory.query().insert({
      pageId: pageRecord.id,
      action: 'approved',
      versionDate: newPageData.versionDate,
      adminApproval: true,
      authorId: newPageData.authorId,
      content: newPageData.content,
      creatorId: newPageData.authorId,
      contentType: newPageData.contentType,
      description: newPageData.description,
      editorKey: newPageData.editorKey,
      hash: newPageData.hash,
      isPrivate: newPageData.isPrivate,
      isPublished: newPageData.isPublished,
      localeCode: newPageData.localeCode,
      path: newPageData.path,
      publishEndDate: newPageData.publishEndDate || '',
      publishStartDate: newPageData.publishStartDate || '',
      title: newPageData.title,
      extra: newPageData.extra
    })
    // -> Update the pageId value
    await WIKI.models.pageHistory.query().update({
      pageId: pageRecord.id,
      adminApproval: true
    }).where('id', opts.id)
    return page
  }

  /**
   * Get All Modified Page Version
   */
  static async allModifyVersion(opts) {
    let version
    if (opts.admin) {
      version = await WIKI.models.pageHistory.query().column([
        'pageHistory.id',
        'pageHistory.path',
        'pageHistory.title',
        'pageHistory.content',
        { locale: 'pageHistory.localeCode' },
        'pageHistory.createdAt',
        'pageHistory.updatedAt',
        'pageHistory.authorId',
        'pageHistory.pageId',
        'pageHistory.adminApproval',
        {
          authorName: 'author.name'
        }
      ]).joinRelated('author').where(
        'authorId', '!=', opts.authorId
      )
    } else {
      version = await WIKI.models.pageHistory.query().column([
        'pageHistory.id',
        'pageHistory.path',
        'pageHistory.title',
        'pageHistory.content',
        { locale: 'pageHistory.localeCode' },
        'pageHistory.createdAt',
        'pageHistory.updatedAt',
        'pageHistory.authorId',
        'pageHistory.pageId',
        'pageHistory.adminApproval',
        {
          authorName: 'author.name'
        }
      ]).joinRelated('author').where(
        'authorId', '=', opts.authorId
      )
    }
    return version ?? []
  }

  /**
   * Get Page Version
   */
  static async getVersion({ pageId, versionId }) {
    const version = await WIKI.models.pageHistory.query()
      .column([
        'pageHistory.path',
        'pageHistory.title',
        'pageHistory.description',
        'pageHistory.isPrivate',
        'pageHistory.isPublished',
        'pageHistory.publishStartDate',
        'pageHistory.publishEndDate',
        'pageHistory.content',
        'pageHistory.contentType',
        'pageHistory.createdAt',
        'pageHistory.action',
        'pageHistory.authorId',
        'pageHistory.pageId',
        'pageHistory.versionDate',
        {
          versionId: 'pageHistory.id',
          editor: 'pageHistory.editorKey',
          locale: 'pageHistory.localeCode',
          authorName: 'author.name'
        }
      ])
      .joinRelated('author')
      .where({
        'pageHistory.id': versionId,
        'pageHistory.pageId': pageId
      }).first()
    if (version) {
      return {
        ...version,
        updatedAt: version.createdAt || null,
        tags: []
      }
    } else {
      return null
    }
  }

  /**
   * Get History Trail of a Page
   */
  static async getHistory({ pageId, offsetPage = 0, offsetSize = 100 }) {
    const history = await WIKI.models.pageHistory.query()
      .column([
        'pageHistory.id',
        'pageHistory.path',
        'pageHistory.authorId',
        'pageHistory.action',
        'pageHistory.adminApproval',
        'pageHistory.versionDate',
        {
          authorName: 'author.name'
        }
      ])
      .joinRelated('author')
      .where({
        'pageHistory.pageId': pageId
      })
      .orderBy('pageHistory.versionDate', 'desc')
      .page(offsetPage, offsetSize)
    const pageData = await WIKI.models.pages.query()
      .column([
        'pages.authorId',
        'pages.creatorId'
      ])
      .where({
        'pages.id': pageId
      })
    let prevPh = null
    const upperLimit = (offsetPage + 1) * offsetSize

    if (history.total >= upperLimit) {
      prevPh = await WIKI.models.pageHistory.query()
        .column([
          'pageHistory.id',
          'pageHistory.path',
          'pageHistory.authorId',
          'pageHistory.action',
          'pageHistory.adminApproval',
          'pageHistory.versionDate',
          {
            authorName: 'author.name'
          }
        ])
        .joinRelated('author')
        .where({
          'pageHistory.pageId': pageId
        })
        .orderBy('pageHistory.versionDate', 'desc')
        .offset((offsetPage + 1) * offsetSize)
        .limit(1)
        .first()
    }

    return {
      trail: _.reduce(_.reverse(history.results), (res, ph) => {
        let actionType = 'edit'
        let valueBefore = null
        let valueAfter = null

        if (!prevPh && ph.authorId === pageData.authorId && history.total < upperLimit) {
          actionType = 'initial'
        } else if (_.get(prevPh, 'path', '') !== ph.path && ph.authorId === pageData.authorId) {
          actionType = 'move'
          valueBefore = _.get(prevPh, 'path', '')
          valueAfter = ph.path
        }

        res.unshift({
          versionId: ph.id,
          authorId: ph.authorId,
          authorName: ph.authorName,
          actionType,
          adminApproval: ph.adminApproval,
          valueBefore,
          valueAfter,
          versionDate: ph.versionDate
        })

        prevPh = ph
        return res
      }, []),
      total: history.total
    }
  }

  /**
   * Purge history older than X
   *
   * @param {String} olderThan ISO 8601 Duration
   */
  static async purge (olderThan) {
    const dur = Duration.fromISO(olderThan)
    const olderThanISO = DateTime.utc().minus(dur)
    await WIKI.models.pageHistory.query().where('versionDate', '<', olderThanISO.toISO()).del()
  }
}
