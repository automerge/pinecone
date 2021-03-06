import { Handle, RepoFrontend } from 'hypermerge'
import { parseDocumentLink, HypermergeUrl, PushpinUrl } from './ShareLink'
import { ContactDoc } from './components/content-types/contact'
import { Doc } from './components/content-types/workspace/Workspace'

//
// Example:
//   this.invitationsView = new InvitationsView(repo, this.props.hypermergeUrl, (invitations) => {
//     debugger
//   })
//

interface Invitation {
  hypermergeUrl: HypermergeUrl
  documentUrl: PushpinUrl
  offererId: HypermergeUrl
  doc?: any
  sender: ContactDoc
}

export default class InvitationsView {
  repo: RepoFrontend
  selfId?: HypermergeUrl
  workspaceHandle: Handle<Doc>
  contactHandles: { [contactId: string]: Handle<ContactDoc> }
  docHandles: { [docId: string]: Handle<any> }
  invitations: Invitation[]
  pendingInvitations: Invitation[]
  onChangeCb?: Function

  constructor(repo: RepoFrontend, workspaceId: HypermergeUrl, onChange: Function) {
    this.repo = repo
    this.contactHandles = {}
    this.docHandles = {}
    this.invitations = []
    this.pendingInvitations = []

    this.onChangeCb = onChange

    this.workspaceHandle = this.repo.watch(workspaceId, (doc) => {
      this.selfId = doc.selfId
      doc.contactIds.forEach((id) => this.watchContact(id))
    })
  }

  watchDoc = (hypermergeUrl: HypermergeUrl) => {
    if (this.docHandles[hypermergeUrl]) {
      return
    }

    const handle = this.repo.watch(hypermergeUrl, (doc) => {
      const index = this.pendingInvitations.findIndex((i) => i.hypermergeUrl === hypermergeUrl)
      if (index !== -1) {
        const invite = this.pendingInvitations[index]
        this.pendingInvitations.splice(index, 1)

        invite.doc = doc
        this.invitations.push(invite)

        if (this.onChangeCb) {
          this.onChangeCb(this.invitations)
        }
      }
    })
    this.docHandles[hypermergeUrl] = handle
  }

  watchContact = (contactId: HypermergeUrl) => {
    if (this.contactHandles[contactId]) {
      return
    }

    this.contactHandles[contactId] = this.repo.watch(contactId, (contact) => {
      if (!contact.offeredUrls) {
        return
      }

      const offererId = contactId
      const offersForUs = (this.selfId && contact.offeredUrls[this.selfId]) || []

      offersForUs.forEach((documentUrl) => {
        const { hypermergeUrl } = parseDocumentLink(documentUrl)
        const matchOffer = (offer: Invitation) =>
          offer.documentUrl === documentUrl && offer.offererId === offererId

        if (!this.pendingInvitations.some(matchOffer)) {
          this.pendingInvitations.push({ documentUrl, offererId, sender: contact, hypermergeUrl })
          this.watchDoc(hypermergeUrl)
        }
      })
    })
  }
}
