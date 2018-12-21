import * as types from '@babel/types'
import cheerio from 'cheerio'
import { PropDefinition } from '../../../../uidl-definitions/types'

/**
 * Generate the AST version of
 * export default {
 *    name: "TestComponent",
 *    props: {  },
 *
 *
 *  }
 *
 * to be used by the vue generator.
 *
 * t is the @babel/types api, used to generate sections of AST
 *
 * params.name is the name of the component ('TestComponent' in the example above)
 */
export const buildEmptyVueJSExport = (t = types, params: { name: string }) => {
  return t.exportDefaultDeclaration(
    t.objectExpression([
      t.objectProperty(t.identifier('name'), t.stringLiteral(params.name)),
      t.objectProperty(t.identifier('props'), t.objectExpression([])),
    ])
  )
}

export const generateSingleVueNode = (params: {
  tagName: string
  selfClosing?: boolean
}): CheerioStatic => {
  const emptyDeclaration = params.selfClosing
    ? `<${params.tagName}/>`
    : `<${params.tagName}> </${params.tagName}>`
  let result

  try {
    result = cheerio.load(emptyDeclaration, {
      xmlMode: true, // otherwise the .html returns a <html><body> thing
      decodeEntities: false, // otherwise we can't set objects like `{ 'text-danger': hasError }`
      // without having them escaped with &quote; and stuff
    })
  } catch (err) {
    result = cheerio.load(`<${params.tagName}> </${params.tagName}>`, {
      xmlMode: true, // otherwise the .html returns a <html><body> thing
      decodeEntities: false, // otherwise we can't set objects like `{ 'text-danger': hasError }`
      // without having them escaped with &quote; and stuff
    })
  }

  return result
}

/**
 * TODO: Remove and favor declared dynamic props in prop definitions, not in
 * this type of filtering where we decide soemthing is dynamic only when it is used
 */
export const splitProps = (props: {
  [key: string]: any
}): { staticProps: any; dynamicProps: any } => {
  return Object.keys(props).reduce(
    (newMap: { staticProps: any; dynamicProps: any }, key) => {
      const keyName = props[key].startsWith('$props') ? 'dynamicProps' : 'staticProps'
      newMap[keyName][key] = props[key]
      return newMap
    },
    { staticProps: {}, dynamicProps: {} }
  )
}

/**
 * TODO: Remove the replacement of $props. when we switch to defined dynamic props
 */
export const addDynamicTemplateBinds = (
  root: Cheerio,
  attrs: { [key: string]: string }
) => {
  Object.keys(attrs).forEach((key) => {
    const propsName = attrs[key].replace('$props.', '')
    root.attr(`:${key}`, propsName)
  })
}

export const generateEmptyVueComponentJS = (
  componentName: string,
  extras: {
    importStatements: any[]
    componentDeclarations: any[]
  },
  scriptLookup: any,
  t = types
) => {
  extras = extras || {
    importStatements: [],
    componentDeclarations: [],
  }

  const astFile = t.file(t.program([]), null, [])
  const vueJSExport = buildEmptyVueJSExport(t, { name: componentName })
  scriptLookup.file = astFile
  scriptLookup.export = vueJSExport
  scriptLookup.exportDeclaration = vueJSExport.declaration as types.ObjectExpression
  scriptLookup.props = scriptLookup.exportDeclaration.properties[1]

  astFile.program.body.push(...extras.importStatements)
  astFile.program.body.push(vueJSExport)

  if (extras.componentDeclarations.length) {
    const componentsObjectDeclaration = t.objectProperty(
      t.identifier('components'),
      t.objectExpression([])
    )

    const componentsList = componentsObjectDeclaration.value as types.ObjectExpression

    componentsList.properties.push(
      ...extras.componentDeclarations.map((declarationName) => {
        return t.objectProperty(
          t.identifier(declarationName),
          t.identifier(declarationName),
          false,
          true
        )
      })
    )

    scriptLookup.exportDeclaration.properties.push(componentsObjectDeclaration)
  }

  return astFile
}

export const generateVueComponentPropTypes = (
  uidlPropDefinitions: Record<string, PropDefinition>
) => {
  return Object.keys(uidlPropDefinitions).reduce((acc: { [key: string]: any }, name) => {
    let mappedType
    const { type, defaultValue } = uidlPropDefinitions[name]
    switch (type) {
      case 'string':
        mappedType = String
        break
      case 'number':
        mappedType = Number
        break
      case 'boolean':
        mappedType = Boolean
        break
      case 'children': // children is converted to slot and should not be added to props
        return acc
      default:
        mappedType = null
    }

    acc[name] = defaultValue ? { type: mappedType, default: defaultValue } : mappedType
    return acc
  }, {})
}
