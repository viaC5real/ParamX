document.addEventListener('DOMContentLoaded', function() {
  let currentParams = [];
  let currentUrl = '';
  let filterTimeout = null;
  let currentCategory = 'all';
  
  // 请求长度限制配置
  const REQUEST_LIMITS = {
    GET: {
      safeLimit: 2000, // 安全限制：2000字符
      warningLimit: 5000, // 警告限制：5000字符
      maxLimit: 8000 // 最大限制：8000字符
    },
    POST: {
      safeLimit: 50000, // 安全限制：50KB
      warningLimit: 100000, // 警告限制：100KB
      maxLimit: 500000 // 最大限制：500KB
    }
  };
  
  // 初始化
  initPopup();
  
  // 初始化弹窗
  async function initPopup() {
    // 获取当前标签页URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      currentUrl = tabs[0].url;
      await loadSavedState();
    }
    
    // 绑定事件
    bindEvents();
  }
  
  // 绑定事件
  function bindEvents() {
    // 提取参数按钮
    document.getElementById('extract-btn').addEventListener('click', extractParameters);
    
    // 复制所有参数按钮
    document.getElementById('copy-all-btn').addEventListener('click', copyAllParameters);
    
    // 构造GET请求按钮 - 使用模态框
    document.getElementById('generate-get-btn').addEventListener('click', openParamSelector);
    
    // 构造JSON请求按钮
    document.getElementById('generate-json-btn').addEventListener('click', generateJsonRequest);
    
    // 输入框实时过滤
    document.getElementById('filter-input').addEventListener('input', function(e) {
      if (filterTimeout) {
        clearTimeout(filterTimeout);
      }
      
      filterTimeout = setTimeout(() => {
        const filterText = e.target.value.toLowerCase();
        filterParams(filterText);
        saveFilterState(filterText);
      }, 300);
    });
    
    // 清空搜索按钮
    document.querySelector('.clear-btn').addEventListener('click', function() {
      document.getElementById('filter-input').value = '';
      filterParams('');
      saveFilterState('');
    });
    
    // 分类标签点击事件
    document.querySelectorAll('.category-badge').forEach(badge => {
      badge.addEventListener('click', function() {
        document.querySelectorAll('.category-badge').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.getAttribute('data-category');
        filterByCategory(currentCategory);
      });
    });
    
    // 模态框关闭按钮
    document.getElementById('close-selector-modal').addEventListener('click', closeParamSelector);
    document.getElementById('cancel-selector-btn').addEventListener('click', closeParamSelector);
  }
  
  // 按分类过滤
  function filterByCategory(category) {
    const filterText = document.getElementById('filter-input').value.toLowerCase();
    filterParams(filterText, category);
    saveCategoryState(category);
  }
  
  // 过滤参数（增强版，支持分类）
  function filterParams(filterText, category = currentCategory) {
    let filteredParams = currentParams;
    
    // 分类过滤
    if (category !== 'all') {
      filteredParams = filteredParams.filter(param => param.category === category);
    }
    
    // 文本过滤
    if (filterText) {
      filteredParams = filteredParams.filter(param => 
	  param.value.toLowerCase().includes(filterText)
		);
    }
    
    displayParams(filteredParams);
    updateParamCount(filteredParams.length);
    
    // 更新状态显示过滤信息
    let statusText = `显示 ${filteredParams.length} 个参数`;
    if (category !== 'all') {
      statusText += ` (${category})`;
    }
    if (filterText) {
      statusText += ` - 过滤: "${filterText}"`;
    }
    updateStatus(statusText);
  }
  
  // 显示参数列表（增强版，显示分类和优先级）
  function displayParams(params) {
    const resultsContainer = document.getElementById('results-container');
    
    if (params.length === 0) {
      const filterText = document.getElementById('filter-input').value;
      if (filterText || currentCategory !== 'all') {
        resultsContainer.innerHTML = '<div class="empty-state">没有找到匹配的参数</div>';
      } else {
        resultsContainer.innerHTML = '<div class="empty-state">没有找到参数</div>';
      }
      return;
    }
    
    resultsContainer.innerHTML = '';
    
    params.forEach((param, index) => {
      const paramItem = document.createElement('div');
      paramItem.className = 'param-item';
      
      paramItem.innerHTML = `
        <div class="param-info">
          <div class="param-value">
            <span class="param-priority priority-${param.priority || 1}">${param.priority || 1}</span>
            ${escapeHtml(param.value)}
          </div>
          <div class="param-meta">
            <span>来源: ${param.source}</span>
            ${param.name ? `<span>变量: ${param.name}</span>` : ''}
            ${param.category ? `<span>分类: ${param.category}</span>` : ''}
          </div>
        </div>
        <button class="copy-btn" data-index="${index}">复制</button>
      `;
      
      resultsContainer.appendChild(paramItem);
    });
    
    // 添加复制按钮事件
    document.querySelectorAll('.copy-btn[data-index]').forEach(btn => {
      btn.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        const paramValue = params[index].value;
        copyToClipboard(paramValue).then(() => {
          updateStatus('已复制单个参数');
        });
      });
    });
  }
  
  // 提取参数
  async function extractParameters() {
    updateStatus('正在提取参数...', false);
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'extractParameters' });
      
      if (response && response.success) {
        currentParams = response.params || [];
        updateParamCount(currentParams.length);
        updateStatus(`成功提取 ${currentParams.length} 个参数`);
        
        // 保存到存储
        await saveParamsToStorage(currentParams);
        displayParams(currentParams);
      } else {
        updateStatus('提取失败或没有找到参数', true);
      }
    } catch (error) {
      console.error('Error:', error);
      updateStatus('错误: ' + error.message, true);
    }
  }
  
  // 复制所有参数 - 修复：考虑分类筛选
  async function copyAllParameters() {
    const filteredParams = getFilteredAndCategorizedParams();
    if (filteredParams.length === 0) {
      updateStatus('没有参数可复制', true);
      return;
    }
    
    const allParams = filteredParams.map(param => param.value).join('\n');
    try {
      await copyToClipboard(allParams);
      updateStatus(`已复制 ${filteredParams.length} 个参数到剪贴板`);
    } catch (err) {
      updateStatus('复制失败: ' + err, true);
    }
  }
  
  // 获取同时经过分类和文本过滤的参数
  function getFilteredAndCategorizedParams() {
    const filterText = document.getElementById('filter-input').value.toLowerCase();
    let filteredParams = currentParams;
    
    // 先按分类过滤
    if (currentCategory !== 'all') {
      filteredParams = filteredParams.filter(param => param.category === currentCategory);
    }
    
    // 再按文本过滤
    if (filterText) {
      filteredParams = filteredParams.filter(param => 
        param.value.toLowerCase().includes(filterText) ||
        (param.name && param.name.toLowerCase().includes(filterText)) ||
        (param.source && param.source.toLowerCase().includes(filterText)) ||
        (param.tags && param.tags.some(tag => tag.includes(filterText)))
      );
    }
    
    return filteredParams;
  }
  
  // 打开参数选择器模态框
  async function openParamSelector() {
    const filteredParams = getFilteredAndCategorizedParams();
    if (filteredParams.length === 0) {
      updateStatus('没有参数可选择', true);
      return;
    }

    showParamSelector(filteredParams);
  }
  
  // 显示参数选择器模态框
  function showParamSelector(params) {
    const modal = document.getElementById('param-selector-modal');
    const paramList = document.getElementById('param-list');
    
    // 清空现有内容
    paramList.innerHTML = '';
    
    // 按优先级排序显示
    const sortedParams = [...params].sort((a, b) => (b.priority || 1) - (a.priority || 1));
    
    sortedParams.forEach((param, index) => {
      const paramItem = document.createElement('div');
      paramItem.className = 'param-selector-item';
      
      paramItem.innerHTML = `
        <label class="param-checkbox">
          <input type="checkbox" data-param='${JSON.stringify(param)}' checked>
          <span class="param-name">${param.value}</span>
          <span class="param-category">${param.category}</span>
        </label>
      `;
      
      paramList.appendChild(paramItem);
    });
    
    // 绑定选择器事件
    bindSelectorEvents(params);
    
    // 显示模态框
    modal.style.display = 'flex';
  }
  
  // 关闭参数选择器模态框
  function closeParamSelector() {
    const modal = document.getElementById('param-selector-modal');
    modal.style.display = 'none';
  }
  
  // 绑定选择器事件
  function bindSelectorEvents(params) {
    // 更新选择计数
    function updateSelectedCount() {
      const selectedCount = document.querySelectorAll('.param-checkbox input:checked').length;
      document.getElementById('selected-count').textContent = selectedCount;
    }
    
    // 全选
    document.getElementById('select-all-btn').addEventListener('click', () => {
      document.querySelectorAll('.param-checkbox input').forEach(checkbox => {
        checkbox.checked = true;
      });
      updateSelectedCount();
    });
    
    // 选择高优先级（优先级4-5）
    document.getElementById('select-high-btn').addEventListener('click', () => {
      document.querySelectorAll('.param-checkbox input').forEach(checkbox => {
        const param = JSON.parse(checkbox.getAttribute('data-param'));
        checkbox.checked = (param.priority || 1) >= 4;
      });
      updateSelectedCount();
    });
    
    // 清空选择
    document.getElementById('select-none-btn').addEventListener('click', () => {
      document.querySelectorAll('.param-checkbox input').forEach(checkbox => {
        checkbox.checked = false;
      });
      updateSelectedCount();
    });
    
    // 生成选中参数的请求
    document.getElementById('generate-selected-btn').addEventListener('click', () => {
      const selectedParams = [];
      document.querySelectorAll('.param-checkbox input:checked').forEach(checkbox => {
        selectedParams.push(JSON.parse(checkbox.getAttribute('data-param')));
      });
      
      if (selectedParams.length === 0) {
        updateStatus('请至少选择一个参数', true);
        return;
      }
      
      const getParams = selectedParams.map(param => {
        // 对于ID类参数，使用数字1，其他使用字符串"1"
        const value = (param.category === 'identifier' || param.value.toLowerCase().includes('id')) ? '1' : '1';
        return `${param.value}=${value}`;
      }).join('&');
      
      // 检查长度并给出警告
      const lengthInfo = checkGetRequestLength(getParams, selectedParams.length, params.length);
      
      copyToClipboard(getParams).then(() => {
        updateStatus(`已复制GET请求参数 (${lengthInfo})`);
        closeParamSelector();
      });
    });
    
    // 单个复选框变化时更新计数
    document.querySelectorAll('.param-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', updateSelectedCount);
    });
    
    // 初始计数
    updateSelectedCount();
  }
  
  // 检查GET请求长度
  function checkGetRequestLength(getParams, selectedCount, totalCount) {
    const length = getParams.length;
    let message = `${selectedCount}/${totalCount}个参数，${length}字符`;
    
    if (length > REQUEST_LIMITS.GET.warningLimit) {
      message += ' ⚠️ 长度警告';
    } else if (length > REQUEST_LIMITS.GET.safeLimit) {
      message += ' ℹ️ 长度注意';
    }
    
    return message;
  }
  
  // 构造JSON请求
  async function generateJsonRequest() {
    const filteredParams = getFilteredAndCategorizedParams();
    if (filteredParams.length === 0) {
      updateStatus('没有参数可构造JSON请求', true);
      return;
    }
    
    // 构造JSON对象
    const jsonObject = {};
    filteredParams.forEach(param => {
      // 对于ID类参数，使用数字1，其他使用字符串"1"
      const value = (param.category === 'identifier' || param.value.toLowerCase().includes('id')) ? 1 : "1";
      jsonObject[param.value] = value;
    });
    
    const jsonString = JSON.stringify(jsonObject, null, 2);
    
    // 检查长度并给出警告
    const lengthInfo = checkJsonRequestLength(jsonString, filteredParams.length);
    
    try {
      await copyToClipboard(jsonString);
      updateStatus(`已复制JSON请求体 (${lengthInfo})`);
    } catch (err) {
      updateStatus('复制失败: ' + err, true);
    }
  }
  
  // 检查JSON请求长度
  function checkJsonRequestLength(jsonString, paramCount) {
    const length = jsonString.length;
    let message = `${paramCount}个参数，${length}字符`;
    
    if (length > REQUEST_LIMITS.POST.warningLimit) {
      message += ' ⚠️ 长度较大';
    } else if (length > REQUEST_LIMITS.POST.safeLimit) {
      message += ' ℹ️ 长度适中';
    }
    
    return message;
  }
  
  // 复制到剪贴板
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    } else {
      // 回退方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      return new Promise((resolve, reject) => {
        try {
          document.execCommand('copy');
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          textArea.remove();
        }
      });
    }
  }
  
  // 保存参数到存储
  async function saveParamsToStorage(params) {
    if (!currentUrl) return;
    
    const data = {
      params: params,
      timestamp: Date.now(),
      url: currentUrl,
      category: currentCategory,
      filterText: document.getElementById('filter-input').value
    };
    
    await chrome.storage.local.set({ [currentUrl]: data });
    console.log('参数已保存到存储:', currentUrl);
  }
  
  // 保存过滤状态
  async function saveFilterState(filterText) {
    if (!currentUrl) return;
    
    const existingData = await chrome.storage.local.get([currentUrl]);
    if (existingData[currentUrl]) {
      existingData[currentUrl].filterText = filterText;
      await chrome.storage.local.set({ [currentUrl]: existingData[currentUrl] });
    }
  }
  
  // 保存分类状态
  async function saveCategoryState(category) {
    if (!currentUrl) return;
    
    const existingData = await chrome.storage.local.get([currentUrl]);
    if (existingData[currentUrl]) {
      existingData[currentUrl].category = category;
      await chrome.storage.local.set({ [currentUrl]: existingData[currentUrl] });
    }
  }
  
  // 加载保存的状态
  async function loadSavedState() {
    if (!currentUrl) return;
    
    const result = await chrome.storage.local.get([currentUrl]);
    const savedData = result[currentUrl];
    
    if (savedData && savedData.params) {
      currentParams = savedData.params;
      updateParamCount(currentParams.length);
      
      // 恢复分类
      if (savedData.category) {
        currentCategory = savedData.category;
        document.querySelectorAll('.category-badge').forEach(badge => {
          badge.classList.toggle('active', badge.getAttribute('data-category') === currentCategory);
        });
      }
      
      // 恢复过滤条件
      if (savedData.filterText) {
        document.getElementById('filter-input').value = savedData.filterText;
        filterParams(savedData.filterText, currentCategory);
      } else {
        filterParams('', currentCategory);
      }
      
      const timeAgo = getTimeAgo(savedData.timestamp);
      updateStatus(`已加载保存的数据 (${timeAgo})`);
    } else {
      updateStatus('就绪 - 点击"提取参数"开始分析');
    }
  }
  
  // 清空当前页面数据
  async function clearCurrentPageData() {
    if (!currentUrl) return;
    
    await chrome.storage.local.remove([currentUrl]);
    currentParams = [];
    document.getElementById('filter-input').value = '';
    currentCategory = 'all';
    document.querySelectorAll('.category-badge').forEach(badge => {
      badge.classList.toggle('active', badge.getAttribute('data-category') === 'all');
    });
    updateParamCount(0);
    updateStatus('已清空当前页面数据');
    displayParams([]);
  }
  
  // 获取时间间隔描述
  function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }
  
  // 更新状态
  function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = isError ? 'status-value error' : 'status-value success';
  }
  
  // 更新参数计数
  function updateParamCount(count) {
    document.getElementById('param-count').textContent = count;
  }
  
  // HTML转义
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});