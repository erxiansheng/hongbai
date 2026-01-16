# 批量重命名 roms/nes 目录中的文件，将空格替换为下划线

$romsPath = "roms\nes"
$files = Get-ChildItem -Path $romsPath -File

$renamed = 0
$skipped = 0

foreach ($file in $files) {
    $oldName = $file.Name
    # 将空格替换为下划线
    $newName = $oldName -replace ' ', '_'
    
    if ($newName -ne $oldName) {
        $oldPath = $file.FullName
        $newPath = Join-Path $file.DirectoryName $newName
        
        # 检查目标文件是否已存在
        if (Test-Path $newPath) {
            Write-Host "跳过 (目标已存在): $oldName" -ForegroundColor Yellow
            $skipped++
        } else {
            Rename-Item -Path $oldPath -NewName $newName
            Write-Host "重命名: $oldName -> $newName" -ForegroundColor Green
            $renamed++
        }
    }
}

Write-Host "`n完成！重命名了 $renamed 个文件，跳过 $skipped 个文件" -ForegroundColor Cyan
