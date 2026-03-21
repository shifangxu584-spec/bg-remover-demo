const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// 请替换为你的 Remove.bg API Key
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || 'YOUR_API_KEY_HERE';

app.use(express.static('public'));
app.use('/output', express.static('output'));

// 首页
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 图片背景移除</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 30px;
    }
    .upload-area {
      border: 3px dashed #667eea;
      border-radius: 15px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
    }
    .upload-area:hover {
      background: #f8f9ff;
      border-color: #764ba2;
    }
    .upload-area input {
      display: none;
    }
    .upload-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 40px;
      border-radius: 30px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
      margin-top: 20px;
      transition: transform 0.2s;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .preview {
      margin-top: 20px;
      display: none;
    }
    .preview img {
      max-width: 100%;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .loading {
      display: none;
      text-align: center;
      margin-top: 20px;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 10px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .result {
      display: none;
      margin-top: 20px;
      text-align: center;
    }
    .download-btn {
      display: inline-block;
      background: #28a745;
      color: white;
      padding: 12px 30px;
      border-radius: 25px;
      text-decoration: none;
      margin-top: 10px;
    }
    .error {
      color: #dc3545;
      text-align: center;
      margin-top: 10px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎨 AI 背景移除</h1>
    <p class="subtitle">上传图片，自动去除背景</p>
    
    <form id="uploadForm" enctype="multipart/form-data">
      <div class="upload-area" onclick="document.getElementById('fileInput').click()">
        <div class="upload-icon">📤</div>
        <p>点击或拖拽图片到这里</p>
        <p style="color: #999; font-size: 14px; margin-top: 5px;">支持 JPG、PNG 格式</p>
        <input type="file" id="fileInput" name="image" accept="image/*" required>
      </div>
      
      <div class="preview" id="preview">
        <p style="margin-bottom: 10px; color: #666;">预览：</p>
        <img id="previewImg" src="" alt="预览">
      </div>
      
      <button type="submit" class="btn" id="submitBtn">开始处理</button>
    </form>
    
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>AI 正在处理中，请稍候...</p>
    </div>
    
    <div class="result" id="result">
      <p style="color: #28a745; font-size: 18px; margin-bottom: 10px;">✅ 处理完成！</p>
      <img id="resultImg" src="" alt="结果" style="max-width: 100%; border-radius: 10px;">
      <br>
      <a id="downloadBtn" href="" download class="download-btn">下载透明背景图片</a>
    </div>
    
    <div class="error" id="error"></div>
  </div>

  <script>
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('preview');
    const previewImg = document.getElementById('previewImg');
    const uploadForm = document.getElementById('uploadForm');
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    const resultImg = document.getElementById('resultImg');
    const downloadBtn = document.getElementById('downloadBtn');
    const error = document.getElementById('error');
    const submitBtn = document.getElementById('submitBtn');

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const file = fileInput.files[0];
      if (!file) {
        showError('请先选择图片');
        return;
      }

      submitBtn.disabled = true;
      loading.style.display = 'block';
      result.style.display = 'none';
      error.style.display = 'none';

      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await fetch('/remove-bg', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          resultImg.src = data.imageUrl;
          downloadBtn.href = data.imageUrl;
          result.style.display = 'block';
        } else {
          showError(data.error || '处理失败，请重试');
        }
      } catch (err) {
        showError('网络错误，请检查连接');
      } finally {
        loading.style.display = 'none';
        submitBtn.disabled = false;
      }
    });

    function showError(msg) {
      error.textContent = msg;
      error.style.display = 'block';
    }

    // 拖拽上传
    const uploadArea = document.querySelector('.upload-area');
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.background = '#f8f9ff';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.background = '';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.background = '';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        const event = new Event('change');
        fileInput.dispatchEvent(event);
      }
    });
  </script>
</body>
</html>
  `);
});

// 处理背景移除
app.post('/remove-bg', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.json({ success: false, error: '请上传图片' });
  }

  if (REMOVE_BG_API_KEY === 'YOUR_API_KEY_HERE') {
    return res.json({ success: false, error: '请先配置 REMOVE_BG_API_KEY' });
  }

  try {
    const formData = new FormData();
    formData.append('image_file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('size', 'auto');

    const response = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
      headers: {
        ...formData.getHeaders(),
        'X-Api-Key': REMOVE_BG_API_KEY
      },
      responseType: 'arraybuffer'
    });

    // 保存结果
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const outputFileName = `bg-removed-${Date.now()}.png`;
    const outputPath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputPath, response.data);

    // 清理上传的文件
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      imageUrl: `/output/${outputFileName}`
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    // 清理上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    let errorMsg = '处理失败';
    if (error.response?.status === 402) {
      errorMsg = 'API 额度已用完，请升级账户';
    } else if (error.response?.status === 403) {
      errorMsg = 'API Key 无效';
    }

    res.json({ success: false, error: errorMsg });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${PORT}/`);
});
