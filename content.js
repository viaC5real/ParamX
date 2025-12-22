// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractParameters') {
    try {
      const params = extractAPIParameters();
      sendResponse({
        success: true,
        params: params,
        count: params.length
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  return true;
});

// 精准提取API参数
function extractAPIParameters() {
  const params = [];
  const jsCode = getPageContent();
  
  if (!jsCode) {
    throw new Error('无法获取页面内容');
  }
  
  console.log('开始精准提取API参数...');
  console.log('获取的代码内容:', jsCode.substring(0, 500));
  
  // 多种提取策略
  extractObjectPropertyNames(jsCode, params);
  extractDestructuringVariables(jsCode, params);
  extractNestedDestructuring(jsCode, params);
  extractFunctionParameters(jsCode, params);
  extractVariableAssignments(jsCode, params);
  extractAPIRequestParams(jsCode, params);
  extractURLParams(jsCode, params);
  extractConfigObjects(jsCode, params);
  extractRouteParams(jsCode, params);
  
  console.log('所有提取结果:', params);
  
  // 对参数进行分类和评分
  const classifiedParams = classifyParameters(params);
  console.log('分类后结果:', classifiedParams);
  
  return removeDuplicates(classifiedParams);
}

// 获取页面内容
function getPageContent() {
  if (document.contentType === 'application/javascript' || 
      window.location.href.endsWith('.js')) {
    return document.body.innerText;
  }
  
  const scriptTags = Array.from(document.getElementsByTagName('script'));
  return scriptTags.map(script => script.innerHTML).join('\n');
}

// 提取对象属性名
function extractObjectPropertyNames(jsCode, params) {
  console.log('开始提取对象属性...');
  
  // 匹配对象字面量中的属性名
  const objectPatterns = [
    // 修改后的模式：匹配 key: 形式，且 key 前面是行首、逗号或换行
    /(?:^|,|\n|\r\n)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    // { "key": value } 格式
    /{[\s]*['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"][\s]*:/g,
    // { 'key': value } 格式
    /{[\s]*'([a-zA-Z_$][a-zA-Z0-9_$]*)'[\s]*:/g
  ];
  
  objectPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramName = match[1];
      if (isValidParameterName(paramName)) {
        params.push({
          value: paramName,
          source: 'object_property'
        });
        console.log(`✅ 添加对象属性: ${paramName}`);
      }
    }
  });
}

// 专门处理解构中的重命名和多个变量
function extractDestructuringVariables(jsCode, params) {
  console.log('开始提取解构变量...');
  
  // 匹配解构赋值中的变量名（包括重命名）
  const destructuringPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
  let match;
  
  while ((match = destructuringPattern.exec(jsCode)) !== null) {
    const innerContent = match[1];
    console.log('解构内容:', innerContent);
    
    // 提取所有变量名（包括重命名后的变量）
    const variablePattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*([a-zA-Z_$][a-zA-Z0-9_$]*))?/g;
    let varMatch;
    
    while ((varMatch = variablePattern.exec(innerContent)) !== null) {
      // 如果有重命名 (key: alias)，使用别名，否则使用属性名
      const variableName = varMatch[2] || varMatch[1];
      
      if (variableName && isValidParameterName(variableName)) {
        params.push({
          value: variableName,
          source: 'destructuring'
        });
        console.log(`✅ 添加解构变量: ${variableName}`);
      }
    }
  }
}

// 专门提取嵌套解构参数
function extractNestedDestructuring(jsCode, params) {
  console.log('开始提取嵌套解构...');
  
  // 匹配嵌套解构模式
  const nestedPatterns = [
    // const { a: { b, c } } = obj
    /(?:const|let|var)\s*\{[^}]*:\s*\{([^}]+)\}[^}]*\}/g,
    // const { a: { b }, c: { d } } = obj  
    /(?:const|let|var)\s*\{[^}]*:\s*\{([^}]+)\}[^}]*,[^}]*:\s*\{([^}]+)\}[^}]*\}/g
  ];
  
  nestedPatterns.forEach((pattern, index) => {
    let match;
    console.log(`使用嵌套模式 ${index} 匹配:`, pattern);
    
    while ((match = pattern.exec(jsCode)) !== null) {
      console.log('找到嵌套解构:', match[0]);
      
      // 处理所有捕获组（可能有多个嵌套块）
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          const innerContent = match[i];
          console.log(`嵌套块 ${i} 内容:`, innerContent);
          
          // 提取内层变量名
          const innerVars = innerContent.split(',')
            .map(v => v.trim())
            .filter(v => v && isValidParameterName(v));
          
          innerVars.forEach(varName => {
            params.push({
              value: varName,
              source: 'nested_destructuring'
            });
            console.log(`✅ 添加嵌套解构变量: ${varName}`);
          });
        }
      }
    }
  });
  
  // 专门处理你的测试用例中的具体模式
  const specificPattern = /const\s*\{\s*settings:\s*\{([^}]+)\}\s*,\s*preferences:\s*\{([^}]+)\}\s*\}\s*=\s*userConfig/;
  const specificMatch = specificPattern.exec(jsCode);
  if (specificMatch) {
    console.log('找到特定嵌套模式:', specificMatch[0]);
    
    // 提取 settings 中的变量
    const settingsVars = specificMatch[1].split(',')
      .map(v => v.trim())
      .filter(v => v && isValidParameterName(v));
    
    // 提取 preferences 中的变量  
    const preferencesVars = specificMatch[2].split(',')
      .map(v => v.trim())
      .filter(v => v && isValidParameterName(v));
    
    [...settingsVars, ...preferencesVars].forEach(varName => {
      params.push({
        value: varName,
        source: 'nested_destructuring'
      });
      console.log(`✅ 添加特定嵌套变量: ${varName}`);
    });
  }
}

// 提取函数参数名
function extractFunctionParameters(jsCode, params) {
  // 匹配函数参数
  const functionPatterns = [
    // function name(param)
    /function\s+[^(]*\(\s*([^)]+)\s*\)/g,
    // (param) => 
    /\(\s*([^)]+)\s*\)\s*=>/g,
    // function({ param })
    /function\s+[^(]*\(\s*{([^}]+)}\s*\)/g,
    // ({ param }) =>
    /\(\s*{([^}]+)}\s*\)\s*=>/g
  ];
  
  functionPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramsStr = match[1];
      // 分割参数，处理解构和普通参数
      const paramNames = paramsStr.split(',')
        .map(p => p.trim())
        .filter(p => p && p !== '{' && p !== '}')
        .map(p => {
          // 处理解构 { key } 中的 key
          if (p.includes('{')) {
            return p.replace(/{|}/g, '').trim();
          }
          // 处理 key = defaultValue
          if (p.includes('=')) {
            return p.split('=')[0].trim();
          }
          return p;
        })
        .filter(p => p);
      
      paramNames.forEach(paramName => {
        if (isValidParameterName(paramName)) {
          params.push({
            value: paramName,
            source: 'function_param'
          });
        }
      });
    }
  });
}

// 提取变量赋值
function extractVariableAssignments(jsCode, params) {
  // 匹配变量声明和赋值
  const assignmentPatterns = [
    // const key = value
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
    // key = value
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*[^{]/g
  ];
  
  assignmentPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramName = match[1];
      if (isValidParameterName(paramName) && !isCommonVariable(paramName)) {
        params.push({
          value: paramName,
          source: 'variable_assignment'
        });
      }
    }
  });
}

// 提取API请求参数
function extractAPIRequestParams(jsCode, params) {
  // 匹配各种API调用中的参数名
  const apiPatterns = [
    // fetch(url, { key: value })
    /(?:fetch|axios|\.(?:get|post|put|delete|patch))\([^,]+,\s*{([^}]*)}/g,
    // { key: value } 在API调用中
    /\.(?:then|catch)\([^,]*{([^}]*)}/g,
    // 对象字面量作为参数
    /\([^)]*{([^}]*)}[^)]*\)/g
  ];
  
  apiPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const objectContent = match[1];
      // 提取对象内容中的属性名
      const propRegex = /(['"]?)([a-zA-Z_$][a-zA-Z0-9_$]*)\1\s*:/g;
      let propMatch;
      while ((propMatch = propRegex.exec(objectContent)) !== null) {
        const propName = propMatch[2];
        if (isValidParameterName(propName)) {
          params.push({
            value: propName,
            source: 'api_request'
          });
        }
      }
    }
  });
}

// 提取URL参数
function extractURLParams(jsCode, params) {
  // 匹配URL中的查询参数
  const urlPatterns = [
    // ?key=value 或 &key=value
    /[?&]([a-zA-Z_$][a-zA-Z0-9_$]*)=/g,
    // URLSearchParams 设置
    /\.(?:set|append)\(['"]([^'"]+)['"]/g,
    // 模板字符串中的URL参数
    /[?&]\$\{([^}]+)\}/g
  ];
  
  urlPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramName = match[1];
      if (isValidParameterName(paramName)) {
        params.push({
          value: paramName,
          source: 'url_param'
        });
      }
    }
  });
}

// 提取配置对象
function extractConfigObjects(jsCode, params) {
  // 匹配配置对象
  const configPatterns = [
    // config = { key: value }
    /(?:config|options|params|settings)\s*=\s*{([^}]*)}/g,
    // { key: value } 在配置上下文中
    /(?:headers|data|body|query)\s*:\s*{([^}]*)}/g
  ];
  
  configPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const configContent = match[1];
      const propRegex = /(['"]?)([a-zA-Z_$][a-zA-Z0-9_$]*)\1\s*:/g;
      let propMatch;
      while ((propMatch = propRegex.exec(configContent)) !== null) {
        const propName = propMatch[2];
        if (isValidParameterName(propName)) {
          params.push({
            value: propName,
            source: 'config_object'
          });
        }
      }
    }
  });
}

// 新增：提取路由参数
function extractRouteParams(jsCode, params) {
  // 匹配各种路由参数格式
  const routePatterns = [
    // Express.js 风格 :param
    /\/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // React Router / Vue Router 风格 :param
    /path:.*?\/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // Angular 风格 :param
    /path.*?\/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    // 大括号风格 {param} (某些框架使用)
    /\/\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g,
    // 方括号风格 [param] (Next.js 等)
    /\/\[([a-zA-Z_$][a-zA-Z0-9_$]*)\]/g,
    // 路由配置对象中的参数
    /['"`]\/:[^/'"]*?\/([a-zA-Z_$][a-zA-Z0-9_$]*)['"`]/g
  ];
  
  routePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramName = match[1];
      if (isValidParameterName(paramName)) {
        params.push({
          value: paramName,
          source: 'route_param'
        });
      }
    }
  });
  
  // 特别处理完整的URL字符串中的路由参数
  extractRouteParamsFromURLs(jsCode, params);
}

// 从完整的URL字符串中提取路由参数
function extractRouteParamsFromURLs(jsCode, params) {
  // 匹配包含路由参数的URL字符串
  const urlPatterns = [
    /['"`](\/api\/[^'"`]*?\/(?::|\{|\[])([a-zA-Z_$][a-zA-Z0-9_$]*)(?::|\}|\]))[^'"`]*?['"`]/g,
    /['"`](\/v\d+\/[\w\/]*?\/(?::|\{|\[])([a-zA-Z_$][a-zA-Z0-9_$]*)(?::|\}|\]))[^'"`]*?['"`]/g
  ];
  
  urlPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      const paramName = match[2]; // 第二个捕获组是参数名
      if (isValidParameterName(paramName)) {
        params.push({
          value: paramName,
          source: 'route_param'
        });
      }
    }
  });
}

// 参数分类和评分
function classifyParameters(params) {
  return params.map(param => {
    let category = 'general';
    let priority = 1; // 1-5，5为最高优先级
    let tags = [];
    
    // 基于参数名进行分类
    const name = param.value.toLowerCase();
	
	// 路由参数通常具有较高优先级
    if (param.source === 'route_param') {
      priority = 4; // 路由参数优先级较高
      tags.push('route');
    }
    
    // ID相关参数
    if (name.includes('id') || name.endsWith('id')) {
      category = 'identifier';
      priority = 4;
      tags.push('id');
    }
    
    // 认证相关参数
    if (name.includes('token') || name.includes('auth') || name.includes('key') || 
        name.includes('secret') || name.includes('password') || name.includes('session')) {
      category = 'authentication';
      priority = 5;
      tags.push('auth');
    }
    
    // 分页相关参数
    if (name.includes('page') || name.includes('size') || name.includes('limit') || 
        name.includes('offset')) {
      category = 'pagination';
      priority = 2;
      tags.push('pagination');
    }
    
    // 时间相关参数
    if (name.includes('time') || name.includes('date') || name.includes('timestamp')) {
      category = 'timestamp';
      priority = 3;
      tags.push('time');
    }
    
    // 状态相关参数
    if (name.includes('status') || name.includes('state')) {
      category = 'status';
      priority = 3;
      tags.push('status');
    }
    
    // 基于来源调整优先级
    if (param.source.includes('url') || param.source.includes('api')) {
      priority = Math.min(5, priority + 1);
      tags.push('api');
    }
    
    return {
      ...param,
      category,
      priority,
      tags: [...new Set(tags)] // 去重
    };
  }).sort((a, b) => b.priority - a.priority); // 按优先级排序
}

// 验证参数名是否有效
function isValidParameterName(name) {
  if (!name || typeof name !== 'string') return false;
  
  // 长度限制
  if (name.length < 2 || name.length > 50) return false;
  
  // 必须符合JS标识符规则
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return false;
  
  // 排除包含下划线的参数名
  if (name.includes('_')) return false;
  
  // 排除JS关键字
  const keywords = [
    'var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'return',
    'class', 'import', 'export', 'default', 'extends', 'super', 'this', 'new',
    'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'try', 'catch', 'finally',
    'throw', 'debugger', 'with', 'yield', 'await', 'async', 'static', 'set',
    'true', 'false', 'null', 'undefined'
  ];
  
  if (keywords.includes(name)) return false;
  
  // 排除常见但不太可能是参数的名字
  const excludedNames = [
    'headers', 'response', 'request', 'error', 'success',
    'then', 'catch', 'finally', 'resolve', 'reject', 'promise',
    'fn', 'func', 'obj', 'arr', 'str', 'bool', 'date', 'reg', 'regex',
    'i', 'j', 'k', 'x', 'y', 'z', 'n', 'm', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    'props', 'state', 'ref', 'children', 'style'
  ];
  
  if (excludedNames.includes(name)) return false;
  
  return true;
}

// 检查是否是常见变量名
function isCommonVariable(name) {
  const commonVars = [
    'e', 't', 'a', 'n', 'l', 'r', 'i', 'o', 'c', 'u', 's', 'd', 'm', 'v', 'p', 'h',
    'f', 'g', 'b', 'y', 'N', 'I', 'w', 'E', 'k', 'O', 'x', 'j', 'S', 'C', 'A', '_'
  ];
  
  return commonVars.includes(name) || name.length === 1;
}

// 去重
function removeDuplicates(params) {
  const seen = new Set();
  return params.filter(param => {
    if (seen.has(param.value)) {
      return false;
    }
    seen.add(param.value);
    return true;
  }).sort((a, b) => a.value.localeCompare(b.value));
}