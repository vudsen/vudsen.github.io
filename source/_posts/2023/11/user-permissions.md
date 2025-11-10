---
title: Linux用户权限管理
date: 2023-11-13 16:52:00
tags:
---

最近突然碰到有关用户授权的问题了，发现自己真的是一点都不会，所有写篇博客记一下常见指令以及碰到过的坑。

# 1. 常用指令

## 1.1 用户
- 新增用户(会同时创建用户组)：`useradd [username]`
- 新增用户并同时创建 home 目录: `useradd -m [username]`
- 设置用户密码：`passwd [username]`
- 删除用户：`userdel [username]`
- 将用户添加到用户组(a为追加)：`usermod -aG [groupname] [username]`

## 1.2 用户组
- 新建用户组：`groupadd [groupname]`


## 1.3 授权
### 1.3.1 chown
chown用于修改文件/文件夹的所属权以及其所属的用户组。

#### 修改文件/文件夹所属用户
```shell
chown [username] [directory/file]
# 递归授权
chown -R [username] [directory]
```

#### 修改文件/文件夹所属用户组
```shell
chown :[usergroup] [directory/file]
# 递归授权
chown -R :[usergroup] [directory]
```

#### 修改文件/文件夹所属用户和用户组
```shell
chown [username]:[usergroup] [directory/file]
# 递归授权
chown -R [username]:[usergroup] [directory]
```

### 1.3.2 chmod

chmod用于细化对所有者，用户组，以及其它用户的相关权限。

一共用三种类型的用户，它们的名字以及符号为：
- 所有者：u 
- 用户组：g 
- 其它：o

例如使用`ll`输出的信息：
```shell
drwx--x--x 2 username groupname83 11月 13 15:28 folder
```
第一部分开头的字符表示的是文件的类型：
- 文件夹：d
- 文件： - (一个横杠，不管是可执行文件还是普通文件)

后面连续9个字符，每3个为一组，分别表示用户所有者、用户组、其它用户的权限。
例如上面的例子：
- 所有者：可读(r)、可写(w)、可执行(x)
- 用户组：可执行(x)
- 其它：可执行(x)

#### 修改用户权限
例如要给用户组(u)添加读和写的权限：
```shell
chmod g+rw [directory/file]
chmod -R g+rw [directory]
```

移除权限：
```shell
chmod g-rw [directory/file]
```

很简单，也就是中间有个加减符号，其实还有个等号，这个就类似于替换了，会覆盖掉之前的权限。

另外，给所有用户授权用a就行了：
```shell
chmod a+rw [directory/file]
```

其实也可以用数字替代rwx，但是这样有点不便于记忆。。

# 2. 应用

## 2.1 文件夹授权了却打不开?

提问：是不是只要某个用户有一个文件夹的读权限，就能打开文件夹了？

大部分可能都会是这样认为的，这也确实比较符合我们的认知，都能读了，还不能打开文件夹？

那么实际呢？我们来试一下。

我们用测试用户(testuser)来进行测试：
```shell
[testuser@localhost opt]# ll
drwx---r--  2 root   root         36 11月 13 16:44 backup
```

这里我们可以看到，testuser拥有backup文件夹的读权限，尝试进入一下：
```shell
[testuser@localhost opt]$ cd backup
bash: cd: backup: 权限不够
```

发现权限是不够的...

这里也不卖关子了，这里其实是需要**执行权限**才能进入文件夹，这里也是比较容易忽略的一点。

## 2.2 可执行文件授权了却打不开?

提问：是不是某个用户只要有一个文件的可执行权限，就可以直接执行文件了？

这里就不卖关子了，答案是不一定。

同样这也是一个非常容易被忽略的问题，以为只要给了可执行权限就能执行了。

来演示一下反例：
```shell
drwx------  2 bim   root         36 11月 13 16:44 backup
```
这里我们的backup文件夹里面放有可执行文件，但是这个文件夹没有对外授权。

```shell
[root@localhost backup]# ll
总用量 23796
-rwx-----x 1 bim root 12691576 11月 13 16:44 mysql
[root@localhost backup]# pwd
/opt/backup
```
在里面的可执行文件mysql，对其它人拥有可执行权限，我们来切换用户试一下：
```shell
[root@localhost backup]# su testuser
[testuser@localhost backup]$ /opt/backup/mysql
bash: /opt/backup/mysql: 权限不够
```

可以发现权限不够，即使你拥有可执行权限。

解决方法在前面也说了，只需要给可执行文件的父目录，也就是这里的backup目录授权可执行就行了，这里就不多演示了。

