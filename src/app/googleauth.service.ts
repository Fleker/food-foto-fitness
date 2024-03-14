import { Injectable } from '@angular/core';
import { NutritionSource } from './app.component';

// If modifying these scopes, delete token.json.
const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.write https://www.googleapis.com/auth/fitness.nutrition.read https://www.googleapis.com/auth/fitness.nutrition.write';

const CLIENT_ID = '763294835062-cb2b58s7agca924hhpfm241n1p5ec0vj.apps.googleusercontent.com'
declare var gapi: any;
declare var google: any;

@Injectable({
  providedIn: 'root'
})
export class GoogleauthService {
  xs?: string
  gclient: any
  loggedIn = false

  constructor() {}

  async setupGSI() {
    setTimeout(() => {
      this.gclient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          console.debug(response)
          if (response.access_token) {
            this.loggedIn = true
            this.xs = response.access_token
            setTimeout(() => {
              this.loggedIn = false
            }, response.expires_in * 1000)
          }
        },
      });
    }, 500)
  }

  setupApi() {
    gapi.load('client', async () => {
      let tokenClient = await google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        ux_mode: 'popup',
        callback: '', // defined later
      });
      console.log('tc', tokenClient)
      if (gapi.client.getToken() === null) {
        console.debug('getToken is null')
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        // tokenClient.requestCode();
        // tokenClient.requestAccessToken()
      } else {
        console.debug('getToken has definition', gapi.client.getToken())
        // Skip display of account chooser and consent dialog for an existing session.
        // tokenClient.requestCode();
      }
    });
  }

  signin() {
    this.gclient.requestAccessToken()
  }

  signout() {
    google.accounts.oauth2.revoke(this.xs)
    this.loggedIn = false
  }

  async generateFitJournalEntry() {
    const accessToken = this.xs
    gapi.client.setToken({access_token: accessToken})
    await gapi.client.init({
      clientId: CLIENT_ID,
      discoveryDocs: [
        'https://discovery.googleapis.com/$discovery/rest',
        'https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest',
      ]
    })
    console.log(gapi.client)
    try {
      const res = await gapi.client.fitness.users.dataSources.create({
        userId: 'me',
        dataStreamName: 'NutritionSource',
        type: 'raw',
        application: {
          detailsUrl: 'http://example.com',
          name: 'Food Fotos for Fitness',
          version: '2024.03.13'
        },
        dataType: {
          name: 'com.google.nutrition',
        }
      })
      console.debug(res)
      return res
    } catch (e: any) {
      console.error('got error with ds', e)
      if (e?.result?.error?.status === 'ALREADY_EXISTS') {
        // Data Source: raw:com.google.nutrition:763294835062:NutritionSource already exists
        return {
          dataStreamId: (e?.result?.error?.message as string).match(/raw:.*?\s/)?.[0].trim()
        }
      }
      throw e
    }
  }

  async patchFitJournalEntry(journalId: string, data: NutritionSource) {
    const accessToken = this.xs
    gapi.client.setToken({access_token: accessToken})
    await gapi.client.init({
      clientId: CLIENT_ID,
      discoveryDocs: [
        'https://discovery.googleapis.com/$discovery/rest',
        'https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest',
      ]
    })
    console.log(gapi.client)
    // const res = await gapi.client.fitness.users.dataSources.datasets.patch({
    //   ...data,
    //   datasetId: Date.now().toString(),
    //   userId: 'me',
    //   dataSourceId: journalId,
    // })
    const res = await fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources/${journalId}/datasets/${Date.now().toString()}`, {
      body: JSON.stringify({
        ...data,
        dataSourceId: journalId,
      }),
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.xs}`
      }
    })
    const resData = await res.json()
    console.debug(resData)
  }
}
