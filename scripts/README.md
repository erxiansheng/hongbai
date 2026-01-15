# ROM上传到阿里云KV存储

## 快速上传方法

### 方法1: 通过边缘函数API上传（推荐）

部署边缘函数后，可以直接通过HTTP上传：

```bash
# 单个文件上传
curl -X PUT "https://your-domain.com/api/upload-rom?key=roms/魂斗罗.zip" \
  -H "X-API-Key: your-secret-upload-key" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"roms/魂斗罗.zip"

# 批量上传（使用Python脚本）
export UPLOAD_API_URL="https://your-domain.com/api/upload-rom"
export UPLOAD_API_KEY="your-secret-upload-key"
python scripts/upload-roms.py api
```

### 方法2: 使用阿里云CLI

```bash
# 安装阿里云CLI
# https://help.aliyun.com/document_detail/139508.html

# 配置
aliyun configure

# 上传单个ROM
aliyun esa PutKv \
  --SiteId your-site-id \
  --Namespace your-namespace \
  --Key "roms/魂斗罗.zip" \
  --Value "$(base64 roms/魂斗罗.zip)"
```

### 方法3: 使用阿里云SDK（Python）

```bash
# 安装SDK
pip install alibabacloud-esa20240910

# 配置环境变量
export ALIBABA_CLOUD_ACCESS_KEY_ID=xxx
export ALIBABA_CLOUD_ACCESS_KEY_SECRET=xxx
export ESA_SITE_ID=your-site-id
export KV_NAMESPACE=nes-roms

# 运行上传脚本
python scripts/upload-roms.py sdk
```

### 方法4: 使用OSS存储（大文件推荐）

如果ROM文件较大，建议使用OSS存储：

```bash
# 安装ossutil
# https://help.aliyun.com/document_detail/120075.html

# 配置
ossutil config

# 批量上传
ossutil cp -r roms/ oss://your-bucket/roms/
```

然后修改边缘函数从OSS获取ROM。

## 配置说明

### 边缘函数环境变量

在阿里云ESA控制台设置：

- `UPLOAD_API_KEY`: 上传API密钥（自定义一个安全的字符串）

### KV命名空间

1. 登录阿里云ESA控制台
2. 进入站点 -> 边缘KV
3. 创建命名空间
4. 在边缘函数中绑定命名空间

## 验证上传

```bash
# 列出所有ROM
curl "https://your-domain.com/api/list-roms"

# 测试获取ROM
curl "https://your-domain.com/api/rom/魂斗罗" -o test.zip
```

## 注意事项

1. KV存储单个值最大25MB，大于此大小的ROM需要使用OSS
2. 上传API需要设置安全的API密钥
3. 建议在上传前压缩ROM文件（已经是zip格式）
4. 中文文件名需要URL编码
