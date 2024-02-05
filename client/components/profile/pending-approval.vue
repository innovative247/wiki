<template lang='pug'>
  v-container(fluid, grid-list-lg)
    v-layout(row wrap)
      v-flex(xs12)
        .profile-header
          img.animated.fadeInUp(src='/_assets/svg/icon-file.svg', alt='Users', style='width: 80px;')
          .profile-header-title
            .headline.primary--text.animated.fadeInLeft Pending Approval List
            .subheading.grey--text.animated.fadeInLeft List of pages user created or last modified
          v-spacer
          v-btn.animated.fadeInDown.wait-p1s(color='grey', outlined, @click='refresh', large)
            v-icon.grey--text mdi-refresh
      v-flex(xs12)
        v-card.animated.fadeInUp
          v-data-table(
            :items='pages'
            :headers='headers'
            :page.sync='pagination'
            :items-per-page='15'
            :loading='loading'
            must-sort,
            sort-by='updatedAt',
            sort-desc,
            hide-default-footer
          )
            template(slot='item', slot-scope='props')
              tr.is-clickable(:active='props.selected', @click='goToPage(props.item.path)')
                td
                  .body-2: strong {{ props.item.title }}
                  .caption {{ props.item.description }}
                td.admin-pages-path
                  v-chip(label, small, :color='$vuetify.theme.dark ? `grey darken-4` : `grey lighten-4`') {{ props.item.locale }}
                  span.ml-2.grey--text(:class='$vuetify.theme.dark ? `text--lighten-1` : `text--darken-2`') / {{ props.item.path }}
                td {{ props.item.authorName}}
                td {{ props.item.createdAt | moment('calendar') }}
                td {{ props.item.updatedAt | moment('calendar') }}
                td
                  span(:class='!props.item.adminApproval ? `yellow approve-span` : `green approve-span`') {{ !props.item.adminApproval ? `Pending`:`Approved`}}

            template(slot='no-data')
              v-alert.ma-3(icon='mdi-alert', :value='true', outlined, color='grey')
                em.caption {{$t('profile:pages.emptyList')}}
          .text-center.py-2.animated.fadeInDown(v-if='this.pageTotal > 1')
            v-pagination(v-model='pagination', :length='pageTotal')
</template>

<script>
import gql from 'graphql-tag'
import _ from 'lodash'
import { get } from 'vuex-pathify'
export default {
  data() {
    return {
      selectedPage: {},
      pagination: 1,
      pages: [],
      loading: false
    }
  },
  computed: {
    headers () {
      return [
        { text: this.$t('profile:pages.headerTitle'), value: 'title' },
        { text: this.$t('profile:pages.headerPath'), value: 'path' },
        { text: 'Author Name', value: 'authorName' },
        { text: this.$t('profile:pages.headerCreatedAt'), value: 'createdAt', width: 250 },
        { text: this.$t('profile:pages.headerUpdatedAt'), value: 'updatedAt', width: 250 },
        { text: 'Approval', value: 'approval' }

      ]
    },
    pageTotal () {
      return Math.ceil(this.pages.length / 15)
    },
    userPermission: get('user/permissions')
  },
  methods: {
    async refresh() {
      await this.$apollo.queries.pages.refetch()
      this.$store.commit('showNotification', {
        message: this.$t('profile:pages.refreshSuccess'),
        style: 'success',
        icon: 'cached'
      })
    },
    async approve(pageId) {
      const resp = await this.$apollo.mutate({
        mutation: gql`
            mutation (
              $id: Int!
            ) {
              pages {
                approveNewPage (
                  id: $id
                ) {
                  responseResult {
                    succeeded
                    errorCode
                    slug
                    message
                  }
                }
              }
            }
          `,
        variables: {
          id: pageId
        }
      })
      if (_.get(resp, 'data.pages.approveNewPage.responseResult.succeeded', false) === true) {
        this.$store.commit('showNotification', {
          style: 'success',
          message: 'Successfully Approved The New Page',
          icon: 'check'
        })
      } else {
        throw new Error(_.get(resp, 'data.pages.approveNewPage.responseResult.message', 'An unexpected error occurred'))
      }
    },
    goToPage(path) {
      window.location.assign(`/h/${path}`)
    }
  },
  apollo: {
    pages: {
      query: gql`
        query($authorId: Int, $admin:Boolean) {
          pages {
            modifiedlist(authorId: $authorId, admin:$admin) {
              id
              path
              title
              content
              createdAt
              updatedAt
              authorId
              authorName
              locale
              pageId
              adminApproval
            }
          }
        }
      `,
      variables () {
        return {
          authorId: this.$store.get('user/id'),
          admin: this.userPermission.includes('manage:system')
        }
      },
      fetchPolicy: 'network-only',
      update: (data) => data.pages.modifiedlist,
      watchLoading (isLoading) {
        this.loading = isLoading
        this.$store.commit(`loading${isLoading ? 'Start' : 'Stop'}`, 'profile-pages-refresh')
      }
    }
  }
}
</script>

<style lang='scss'>
  .approve-span{
    padding: 10px;
    border-radius: 5px;
  }
</style>
