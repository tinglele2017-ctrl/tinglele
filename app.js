// 成长记忆相册 - 主程序

class GrowthAlbum {
    constructor() {
        this.data = this.loadData();
        this.currentAge = null;
        this.init();
        this.createFloatingHearts();
    }

    // 初始化数据结构
    init() {
        if (!this.data.ages) {
            // 生成0-18岁的年龄节点
            this.data.ages = {};
            for (let i = 0; i <= 18; i++) {
                this.data.ages[i] = {
                    photos: []
                };
            }
            this.saveData();
        }
        this.bindEvents();
        this.renderTimeline();
    }

    // 从localStorage加载数据
    loadData() {
        try {
            const saved = localStorage.getItem('growthAlbum');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    // 保存数据到localStorage
    saveData() {
        localStorage.setItem('growthAlbum', JSON.stringify(this.data));
    }

    // 绑定事件
    bindEvents() {
        // 添加照片按钮
        document.getElementById('addPhotoBtn').addEventListener('click', () => {
            this.openUploadModal();
        });

        // 上传区域点击
        document.getElementById('uploadArea').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        // 文件选择变化
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // 拖拽上传
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleDrop(e);
        });

        // 取消上传
        document.getElementById('cancelUpload').addEventListener('click', () => {
            this.closeUploadModal();
        });

        // 确认上传
        document.getElementById('confirmUpload').addEventListener('click', () => {
            this.confirmUpload();
        });

        // 关闭查看器
        document.getElementById('closeViewer').addEventListener('click', () => {
            this.closeViewer();
        });
        document.getElementById('viewerModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewerModal' || e.target.id === 'viewerBackdrop') {
                this.closeViewer();
            }
        });

        // 点击蒙层关闭上传模态框
        document.getElementById('uploadModal').addEventListener('click', (e) => {
            if (e.target.id === 'uploadModal') {
                this.closeUploadModal();
            }
        });
    }

    // 渲染时间轴
    renderTimeline() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = '';

        Object.keys(this.data.ages).sort((a, b) => a - b).forEach((age) => {
            const photoCount = this.data.ages[age].photos.length;
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="age-label">${age} 岁</div>
                <div class="photo-count">${photoCount} 张照片</div>
            `;
            item.addEventListener('click', () => {
                this.selectAge(age);
            });
            timeline.appendChild(item);
        });

        // 默认选中第一个有照片的年龄，或者0岁
        const agesWithPhotos = Object.keys(this.data.ages).filter(age => this.data.ages[age].photos.length > 0);
        if (agesWithPhotos.length > 0) {
            this.selectAge(agesWithPhotos[0]);
        } else {
            this.selectAge('0');
        }
    }

    // 选择年龄
    selectAge(age) {
        this.currentAge = age;

        // 更新选中状态
        document.querySelectorAll('.timeline-item').forEach((item, index) => {
            if (index === parseInt(age)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 渲染照片
        this.renderPhotos();

        // 显示添加按钮
        document.getElementById('addPhotoBtn').style.display = 'flex';
        document.getElementById('addPhotoBtn').querySelector('span').textContent = '+';
    }

    // 渲染照片
    renderPhotos() {
        const photoGrid = document.getElementById('photoGrid');
        const emptyState = document.getElementById('emptyState');
        const photos = this.data.ages[this.currentAge].photos;

        photoGrid.innerHTML = '';

        if (photos.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        photos.forEach((photo, index) => {
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.style.animationDelay = `${index * 0.1}s`;
            card.innerHTML = `
                <img src="${photo.dataUrl}" alt="${photo.description}">
                <div class="photo-info">
                    <div class="photo-desc">${photo.description || `${this.currentAge}岁的记忆`}</div>
                    <div class="photo-date">${new Date(photo.date).toLocaleDateString('zh-CN')}</div>
                </div>
                <div class="photo-delete" data-index="${index}">&times;</div>
            `;

            // 点击图片查看大图
            card.querySelector('img').addEventListener('click', () => {
                this.openViewer(photo);
            });

            // 删除照片
            card.querySelector('.photo-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这张照片吗？')) {
                    this.deletePhoto(index);
                }
            });

            photoGrid.appendChild(card);
        });
    }

    // 打开上传模态框
    openUploadModal() {
        document.getElementById('uploadModal').classList.add('active');
        this.selectedFiles = [];
    }

    // 关闭上传模态框
    closeUploadModal() {
        document.getElementById('uploadModal').classList.remove('active');
        document.getElementById('fileInput').value = '';
        document.getElementById('photoDesc').value = '';
        this.selectedFiles = [];
    }

    // 处理文件选择
    handleFileSelect(e) {
        this.selectedFiles = Array.from(e.target.files);
    }

    // 处理拖拽
    handleDrop(e) {
        this.selectedFiles = Array.from(e.dataTransfer.files).filter(file => 
            file.type.startsWith('image/')
        );
    }

    // 确认上传
    confirmUpload() {
        if (!this.currentAge) return;

        const desc = document.getElementById('photoDesc').value.trim();
        const promises = [];

        this.selectedFiles.forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            promises.push(new Promise(resolve => {
                reader.onload = (e) => {
                    const photo = {
                        description: desc,
                        date: Date.now(),
                        dataUrl: e.target.result
                    };
                    this.data.ages[this.currentAge].photos.push(photo);
                    resolve();
                };
                reader.readAsDataURL(file);
            }));
        });

        Promise.all(promises).then(() => {
            this.saveData();
            this.renderTimeline();
            this.renderPhotos();
            this.closeUploadModal();
        });
    }

    // 删除照片
    deletePhoto(index) {
        this.data.ages[this.currentAge].photos.splice(index, 1);
        this.saveData();
        this.renderTimeline();
        this.renderPhotos();
    }

    // 打开图片查看器
    openViewer(photo) {
        const modal = document.getElementById('viewerModal');
        const img = document.getElementById('viewerImage');
        const desc = document.getElementById('viewerDesc');
        const dateEl = document.getElementById('viewerDate');

        img.src = photo.dataUrl;
        desc.textContent = photo.description || `${this.currentAge}岁的记忆`;
        dateEl.textContent = new Date(photo.date).toLocaleDateString('zh-CN');

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // 关闭图片查看器
    closeViewer() {
        document.getElementById('viewerModal').classList.remove('active');
        document.body.style.overflow = '';
    }

    // 创建浮动爱心背景动画
    createFloatingHearts() {
        setInterval(() => {
            if (Math.random() > 0.7) {
                const heart = document.createElement('div');
                heart.className = 'heart';
                heart.textContent = '❤️';
                heart.style.left = Math.random() * 100 + '%';
                heart.style.fontSize = (Math.random() * 20 + 10) + 'px';
                heart.style.animationDuration = (Math.random() * 5 + 5) + 's';
                document.body.appendChild(heart);

                setTimeout(() => {
                    heart.remove();
                }, 10000);
            }
        }, 2000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.album = new GrowthAlbum();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('viewerModal').classList.remove('active');
        document.getElementById('uploadModal').classList.remove('active');
        document.body.style.overflow = '';
    }
});
