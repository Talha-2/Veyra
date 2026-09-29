---
title: Leads and pipelines
description: Move contacts through a sales pipeline on a board, a list or a table, add leads by hand or import them from a CSV file.
---

A lead is a contact moving through a pipeline. A pipeline is the set of stages a lead passes through, such as New, Contacted, Quoted and Won. Open leads at **Desk → Leads**.

Every new organization starts with one pipeline, **Sales**, with the stages **New**, **Contacted**, **Quoted** and **Won**. You create and change pipelines in Studio: see [Pipelines](#pipelines) below.

## The summary

At the top of the page, a summary shows the pipeline at a glance:

- **Pipeline value**: the total value of all leads shown.
- **Leads**: how many there are.
- **Average**: the average value per lead.
- **Overdue follow-ups**: leads whose next follow-up date has passed.
- A bar that splits the value across the stages.

## Find leads

- If you have more than one pipeline, choose it with **Pipeline**.
- Choose **Everyone** or **Assigned to me**.
- Search with **Search leads**. It matches the contact's name, company and phone.
- Filter by **Source**: **Manual**, **Call**, **Sms**, **Form**, **Meta ads**, **Google ads**, **Website**, **Referral** or **Import**.
- Switch between **Board**, **List** and **Table**.

The view, pipeline and filters are part of the page address, so you can share them as a link.

## Board

The board has one column per stage, with the total value of each column at the top. Drag a card to another column to move the lead to that stage, or within a column to change its order. Select **Add lead** at the bottom of a column to add a lead straight into that stage.

Each card shows the contact, company, source, value, next follow-up date and the people assigned. Select a card to open the contact.

## List

The list groups leads by stage. Each group shows its count and value, and you can fold it. Change a lead's stage with the stage selector on its row. Select **Add** on a group to add a lead in that stage.

## Table

The table shows one row per lead with **Lead**, **Stage**, **Value**, **Source**, **Phone**, **Assigned**, **Next touch** and **Updated**. Select a column heading to sort by it.

Tick the boxes to select several leads, then:

- **Move to** a stage;
- assign them to people;
- **Remove** them from the pipeline. The contacts are kept.

## Add a lead

1. Select **New lead**.
2. Enter the person's **Name**, **Company**, **Phone** and **Email**.
3. Choose the **Stage**, the **Source** and the **Value**.
4. Choose people under **Assign**.
5. Select **Add lead**.

If the person is not a contact yet, Veyra creates the contact too. The lead appears on their contact page under **Pipelines**.

## Import leads from a CSV file

1. Select **Import CSV**.
2. Select **Choose a CSV file**. The first row must be the column names. Files can be up to 5 MB.
3. Under **Match the columns**, choose which column holds the **Name**, **Phone**, **Email**, **Company** and **Value**. Veyra guesses from the column names; choose **Skip** for anything you do not want.
4. Select **Import**.

All imported leads go into the first stage of the current pipeline, with the source **Import**. Each row is matched to an existing contact by phone or email first, so importing the same file twice does not create duplicate contacts or duplicate leads in the same pipeline. Rows with no name, phone or email are skipped. When the import finishes, Veyra shows how many contacts were new, matched and skipped.

## Follow-up dates

A lead can have a next follow-up date (**Next touch**) and an outreach note. When the date has passed, the lead shows **Overdue**, counts in **Overdue follow-ups**, and appears on the assigned person's dashboard under **Overdue**.

Today you set the follow-up date and the outreach note through the API. See the [Leads reference](/docs/api-reference/leads).

## Pipelines

Pipelines and their stages are set up in Studio, under **Studio → Settings → Lead pipelines**. You need access to Studio to change them. See [Organization and team](/docs/studio/settings).

If there is no pipeline yet, the Leads page says **No pipeline yet** and **New lead** and **Import CSV** are turned off.

## Leads and the API

Your systems can create leads, update them and move them between stages through the API, for example from a web form or an ad platform. See the [Leads reference](/docs/api-reference/leads) and the [Pipelines reference](/docs/api-reference/pipelines).
