/**

Copyright 2019 Forestry.io Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

import { FormOptions, Form } from '@tinacms/core'
import * as React from 'react'
import { useCMS } from './use-cms'
const get = require('lodash.get')

interface UseFormOptions extends FormOptions<any> {
  currentValues?: any
}
export function useCMSForm<FormShape = any>(
  options: UseFormOptions
): [FormShape, Form | undefined] {
  if (process.env.NODE_ENV === 'production') {
    return [options.initialValues, undefined]
  }
  const cms = useCMS()
  const [form, setForm] = React.useState<Form | undefined>()
  const [_, setValues] = React.useState(options.initialValues)

  React.useEffect(
    function createForm() {
      if (!options.initialValues) return
      const form = cms.forms.createForm(options)
      setForm(form)
      const unsubscribe = form.subscribe(
        form => {
          setValues(form.values)
        },
        { values: true }
      )

      return () => {
        unsubscribe()
        if (form) {
          cms.forms.removeForm(form.id)
        }
      }
    },
    [options.id, options.initialValues]
  )

  React.useEffect(() => {
    if (!form) return
    form.updateFields(options.fields)
  }, [form, options.fields])

  React.useEffect(() => {
    if (!form) return
    form.label = options.label
  }, [form, options.label])

  syncFormWithCurrentValues(
    form,
    options.currentValues || options.initialValues
  )

  return [form ? form.values : options.initialValues, form]
}

/**
 * Updates the Form with new values from the MarkdownRemark node.
 *
 * Only updates fields that are:
 *
 * 1. registered with the form
 * 2. not currently [active](https://final-form.org/docs/final-form/types/FieldState#active)
 *
 */
function syncFormWithCurrentValues(form?: Form, initialValues?: any) {
  React.useEffect(() => {
    if (!form) return
    form.finalForm.batch(() => {
      findInactiveFormFields(form).forEach(path => {
        form.finalForm.change(path, get(initialValues, path))
      })
    })
  }, [form, initialValues])
}

export function findInactiveFormFields(form: Form) {
  let pathsToUpdate: string[] = []

  const hiddenFields = Object.entries(form.hiddenFields)
  const declaredFields = Object.entries(form.fieldSubscriptions)
  const allFields = hiddenFields.concat(declaredFields)

  allFields.forEach(([path, field]) => {
    pathsToUpdate = pathsToUpdate.concat(findInactiveFieldsInPath(form, path))
  })
  return pathsToUpdate
}

/**
 * Recursively looks up all non-[active](https://final-form.org/docs/final-form/types/FieldState#active)
 * fields associated with a path.
 *
 *
 * Simple string
 * ```
 * 'name' => ['name']
 * ```
 *
 * With a list of two authors:
 * ```
 * 'authors.INDEX.name' => [
 *  'authors.0.name',
 *  'authors.1.name',
 * ]
 * ```
 *
 * With a list of one author with two books:
 * ```
 * 'authors.INDEX.books.INDEX.title' => [
 *  'authors.0.books.0.title',
 *  'authors.0.books.1.title',
 * ]
 * ```
 */
export function findInactiveFieldsInPath(form: Form, path: string) {
  let pathsToUpdate: string[] = []

  if (/INDEX/.test(path)) {
    const listPath = path.split('.INDEX.')[0]
    const listState = get(form.finalForm.getState().values, listPath, [])
    if (listState) {
      for (let i = 0; i < listState.length; i++) {
        const indexPath = path.replace('INDEX', `${i}`)
        const subpaths = findInactiveFieldsInPath(form, indexPath)
        pathsToUpdate = [...pathsToUpdate, ...subpaths]
      }
    }
  } else {
    const state = form.finalForm.getFieldState(path)
    if (!state || !state.active) {
      pathsToUpdate.push(path)
    }
  }
  return pathsToUpdate
}