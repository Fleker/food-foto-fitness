import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { MatButtonModule } from '@angular/material/button'
import { MatSelectModule } from '@angular/material/select'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
    BrowserAnimationsModule,
    MatProgressSpinnerModule,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }