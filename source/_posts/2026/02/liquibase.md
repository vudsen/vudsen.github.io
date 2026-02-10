---
title: Liquibase 全标签使用样例
date: 2026-02-10 11:05:24
seo:
  description: Liquibase 全标签使用样例；Liquibase 入门教程。
---

# 发现的坑

## 部分数据库在创建表时事务会失效

Mysql和Oracle在一个事务中创建表时，即使事务失败回滚，**表也不会删除，导致再跑changelog时出现表名冲突报错**。

而PostgreSQL可以正常删除表。

可以在创建表的时候写好rollback：

```xml
<changeSet id="t13" author="vudsen">
    <createTable tableName="table13">
        <column name="col1" type="${type.int}"/>
        <column name="col2" type="${type.int}"/>
        <column name="col3" type="${type.int}"/>
    </createTable>
    <rollback>
        <dropTable tableName="table13"/>
    </rollback>
</changeSet>
```

然后添加listener：

```java
public class ChangeExecListenerImpl implements ChangeExecListener {

     @Override
    public void runFailed(ChangeSet changeSet, DatabaseChangeLog databaseChangeLog, Database database, Exception exception) {
        List<Change> changes = changeSet.getChanges();
        String shortName = database.getShortName();
        if ("mysql".equals(shortName) || "oracle".equals(shortName)) {
            boolean shouldRollbackNow = false;
            for (Change change : changes) {
                if (change instanceof CreateTableChange) {
                    shouldRollbackNow = true;
                    break;
                }
            }
            if (!shouldRollbackNow) {
                return;
            }
            log.info("正在执行回滚逻辑");
            RollbackContainer rollback = changeSet.getRollback();
            try {
                database.setAutoCommit(false);
                database.rollback();
                for (Change change : rollback.getChanges()) {
                    database.executeStatements(change, databaseChangeLog, Collections.emptyList());
                }
                database.commit();
            } catch (LiquibaseException e) {
                try {
                    database.rollback();
                } catch (DatabaseException ex) {
                    throw new RuntimeException(ex);
                }
                throw new RuntimeException(e);
            }
        }
    }
   
}
```


## 语法提示有某个属性，但是文档没有

出现这种情况应该是schema的版本和文档不一致：

```text
xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.9.xsd
```

只要把后面的版本和依赖版本配置成一样的就好了。

# changeSet

## tagDatabase

用于给Changelog标记一个版本号，便于回滚时使用：

```xml
<changeSet  author="liquibase-docs"  id="tagDatabase-example">  
    <tagDatabase  tag="version_1.3"/>  
</changeSet>
```

回滚时有一个根据tag来回滚的方法，**没有根据changeSet id回滚的方法**。

## createTable

### column

| 属性名                     | MySql                        | PostgreSQL                    | Oracle                       | 功能说明                       | 备注                                                         |
| -------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ------------------------------ | ------------------------------------------------------------ |
| name                       | ✅                            | ✅                            | ✅                            | 指定列名                       |                                                              |
| type                       | ✅                            | ✅                            | ✅                            | 指定列属性                     | 见下方备注                                                   |
| value                      | ✅                            | ✅                            | ✅                            | 指定该列的值                   | 仅用于update、insert，使用时会自动套引号，手动加引号会被转义 |
| afterColumn                | ❌ | ❌ | ❌ | 将该列置于某列之后             | 不起作用                                                     |
| beforeColumn               | ❌ | ❌ | ❌ | 将该列置于某列之前             | 不起作用                                                     |
| position                   | ❌ | ❌ | ❌ | 设置该列的位置                 | 不起作用                                                     |
| autoIncrement              | ✅                            | ✅                            | ✅                            | 自动增长                       |                                                              |
| computed                   | ❌ | ❌ | ❌ | 声明name为函数调用而不是字符串 | 仍然被当做字符串提交了                                       |
| defaultValue               | ✅                            | ✅                            | ✅                            | 默认值                         |                                                              |
| defaultValueBoolean        | ✅                            | ✅                            | ✅                            | 默认布尔值                     |                                                              |
| defaultValueComputed       | ✅                            | ✅                            | ✅                            | 声明默认函数值                 | 一般用于Date类型的now                                        |
| defaultValueConstraintName | ?                            | ?                            | ?                            | 声明默认的约束名称             | 文档中有这个字段，但实际用不了                               |
| defaultValueDate           | ✅                            | ✅                            | ✅                            | 声明默认日期                   |                                                              |
| defaultValueNumeric        | ✅                            | ✅                            | ✅                            | 声明默认数字                   |                                                              |
| descending                 | ❌ | ✅                            | ✅                            | 声明索引是升序还是降序         | 默认升序，mysql8.0+才支持                                    |
| remark                     | ✅                            | ✅                            | ✅                            | 备注                           |                                                              |
| incrementBy                | ❌                            | ✅                            |     ✅                        |  自增主键每次增长多少 |和startWith一起用oracle会报错
| startWith                  | ❌                            | ❌ | ✅                       | 自增主键从哪里开始             | 和incrementBy一起用oracle会报错                              |
| encoding                   | ✅                            | ❌ | ✅                       | 指定valueClobFile字符集        |                                                              |
| valueBlobFile              | ✅                            | ✅                            | ✅                            | 从文件中读取二进制数据         | 插入数据时使用                                               |
| valueClobFile              | ✅                            | ✅                            | ✅                            | 从文件中读取大对象             | 插入数据时使用                                               |
| valueComputed              | ✅                            | ✅                            | ✅                            | 使用函数获取value值            | 插入数据时使用                                               |
| valueDate                  | ✅                            | ✅                            | ✅                            | 使用date                       | 插入数据时使用                                               |
| valueNumeric               | ✅                            | ✅                            | ✅                            | 使用数字                       | 插入数据时使用                                               |

备注：type可以直接使用如下值，会被自动转换成对应数据库的数据结构：

- `BIGINT`
- `BLOB`
- `BOOLEAN`
- `CLOB`
- `CURRENCY`
- `DATE`
- `DATETIME`
- `TIME`
- `UUID`

也可以直接使用java类，如：

- `java.sql.Types.TIMESTAMP`
- `java.sql.Types.VARCHAR(255)`

#### constraints

| 属性名               | MySql                        | PostgreSQL                    | Oracle                       | 功能说明                         | 备注                                            |
| -------------------- | ---------------------------- | ---------------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------- |
| primaryKey           | ✅                            | ✅                            | ✅                            | 主键                             |                                                 |
| nullable             | ✅                            | ✅                            | ✅                            | 是否可空                         |                                                 |
| checkConstraint      | ❌ | ❌ | ❌ | check约束                        |                                                 |
| primaryKeyTablespace | ?                            | ?                            | ?                            | 指定主键表空间                   | 未测试                                          |
| foreignKeyName       | ?                            | ?                            | ?                            | 外键名称                         | 推荐使用addForeignKeyConstraint标签             |
| deleteCascade        | ?                            | ?                            | ?                            | 当外键删除时是否跟着删除对应的行 | 推荐使用addForeignKeyConstraint标签             |
| unique               | ✅                            | ✅                            | ✅                            | 是否唯一                         |                                                 |
| uniqueConstraintName | ✅                            | ✅                            | ✅                            | 唯一键名称                       |                                                 |
| references           | ?                            | ?                            | ?                            | 定义外键                         | 不推荐使用，该属性会将值原封不动的贴到SQL语句上 |
| initiallyDeferred    | ❌ | ?                            | ?                            | 立即检查约束                     | MySql不支持，Oracle文档上支持，但没有测试出结果 |
| deferrable           | ❌ | ?                            | ?                            | 延迟检查约束                     | MySql不支持，Oracle文档上支持，但没有测试出结果 |

## createIndex

| 属性名      | MySql                        | PostgreSQL | Oracle | 功能说明         | 备注                                                         |
| ----------- | ---------------------------- | --------- | ------ | ---------------- | ------------------------------------------------------------ |
| catalogName | ✅                            | ✅         | ✅      | 目录名           | CREATE INDEX xx ON `catalogName`.column ...                  |
| clustered   | ❌ | ?         | ?      | 是否为聚簇索引   | PostgreSQL的聚簇索引不允许在事务下创建，oracle的聚簇索引由于liquibase拼接sql有误导致创建失败，mysql忽视了该语句(可能是没有这个功能) |
| indexName   | ✅                            | ✅         | ✅      | 索引名称         |                                                              |
| schemaName  | ?                            | ?         | ?      | schema名称       | 未测试，可以使用catalogName代替                              |
| tableName   | ✅                            | ✅         | ✅      | 要给哪个表加索引 |                                                              |
| tablespace  | ?                            | ?         | ?      | 表空间           | 未测试                                                       |
| unique      | ✅                            | ✅         | ✅      | 是否为唯一键     |                                                              |

## createProcedure

存储过程只能通过手写sql来创建：[createProcedure (liquibase.com)](https://docs.liquibase.com/change-types/create-procedure.html?Highlight=createProcedure)

## createView

视图只能通过手写sql来创建：[createView (liquibase.com)](https://docs.liquibase.com/change-types/create-view.html?Highlight=createView)

## createSequence

[createSequence (liquibase.com)](https://docs.liquibase.com/change-types/create-sequence.html?Highlight=createSequence)

创建一个序列。**MySQL不支持**，PostgreSQL和Oralce支持。

## addColumn

| 属性名      | MySql | PostgreSQL | Oracle | 功能说明     | 备注                            |
| ----------- | ----- | --------- | ------ | ------------ | ------------------------------- |
| tableName   | ✅     | ✅         | ✅      | 要创建的表名 |                                 |
| catalogName | ✅     | ✅         | ✅      | 目录名       |                                 |
| schemaName  | ?     | ?         | ?      | schema名称   | 未测试，可以使用catalogName代替 |

## addForeignKeyConstraint

| 属性名                | MySql                        | PostgreSQL                    | Oracle                       | 功能说明                                                   | 备注                       |
| --------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------------------------------------- | -------------------------- |
| baseTableName         | ✅                            | ✅                            | ✅                            | 给哪个表加外键                                             |                            |
| baseColumnNames       | ✅                            | ✅                            | ✅                            | 给哪个列加外键                                             |                            |
| constraintName        | ✅                            | ✅                            | ✅                            | 外键名称                                                   |                            |
| referencedTableName   | ✅                            | ✅                            | ✅                            | 外键指向哪个表                                             |                            |
| referencedColumnNames | ✅                            | ✅                            | ✅                            | 外键指向表的哪个字段                                       |                            |
| deleteCascade         | ✅                            | ✅                            | ✅                            | 当外键指向的表中，某行被删除后，删除对应其它所有指向它的行 |                            |
| onUpdate              | ❌ | ❌ | ❌ | 当外键被更新后的操作                                       |                            |
| onDelete              | ✅                            | ✅                            | ✅                            | 当外键被删除后的操作                                       |                            |
| validate              | ?                            | ?                            | ?                            | 添加约束时，是否检查所有的行是否满足约束                   | 文档有，但是代码用了会报错 |

## addPrimaryKey

| 属性名         | MySql                        | PostgreSQL | Oracle | 功能说明                                 | 备注                            |
| -------------- | ---------------------------- | --------- | ------ | ---------------------------------------- | ------------------------------- |
| catalogName    | ✅                            | ✅         | ✅      | 目录名                                   |                                 |
| columnNames    | ✅                            | ✅         | ✅      | 要给哪些列加主键                         | 复合主键使用逗号分割列          |
| constraintName | ❌ | ✅         | ✅      | 主键名称                                 | Mysql主键固定为`PRIMARY`        |
| schemaName     | ?                            | ?         | ?      | schema                                   | 未测试，可以使用catalogName代替 |
| tableName      | ✅                            | ✅         | ✅      | 要给哪个表加主键                         |                                 |
| tablespace     | ?                            | ?         | ?      | 表空间                                   | 未测试                          |
| validate       | ?                            | ?         | ?      | 添加约束时，是否检查所有的行是否满足约束 | 文档有，但是代码用了会报错      |

## addDefaultValue

| 属性名       | MySql | PostgreSQL | Oracle | 功能说明           | 备注                              |
| ------------ | ----- | --------- | ------ | ------------------ | --------------------------------- |
| catalogName  | ✅     | ✅         | ✅      | 目录名             |                                   |
| columnName   | ✅     | ✅         | ✅      | 列名               |                                   |
| defaultValue | ✅     | ✅         | ✅      | 默认值             | 此处省略了其它`defaultValue*`属性 |
| tableName    | ✅     | ✅         | ✅      | 要给哪个表加默认值 |                                   |

## addUniqueConstraint

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明           | 备注             |
| -------------- | ----- | --------- | ------ | ------------------ | ---------------- |
| tableName      | ✅     | ✅         | ✅      | 表名称             |                  |
| columnNames    | ✅     | ✅         | ✅      | 要给哪个列加唯一键 | 多个列用逗号分割 |
| constraintName | ✅     | ✅         | ✅      | 约束名称           |                  |
| catalogName    | ✅     | ✅         | ✅      | 目录名             |                  |

## addLookupTable

功能和添加外键相同，但是这个标签会自动把数据同步过去:

```xml
<changeSet id="t11" author="vudsen">
    <createTable tableName="table9">
        <column name="col1" type="${type.int}"/>
        <column name="col2" type="${type.int}"/>
    </createTable>
    <insert tableName="table9">
        <column name="col1" value="1"/>
        <column name="col2" value="1"/>
    </insert>
    <addLookupTable existingTableName="table9" existingColumnName="col1" newTableName="t11_lut" newColumnName="col1_lut" newColumnDataType="${type.int}"/>
</changeSet>
```

在运行后，会给table9创建一个`FK_TABLE9_T11_LUT`的外键，指向表`t11_lut(col1_lut)`，同时，`t11_lut`中也会有`table9`的数据。

Mysql、PostgreSQL和Oracle都支持。

## addAutoIncrement

Oracle不支持，MySQL和PostgreSQL支持

| 属性名         | MySql                        | PostgreSQL                    | Oracle                       | 功能说明       | 备注 |
| -------------- | ---------------------------- | ---------------------------- | ---------------------------- | -------------- | ---- |
| tableName      | ✅                            | ✅                            | ❌ | 表名           |      |
| columnName     | ✅                            | ✅                            | ❌ | 列名           |      |
| incrementBy    | ❌ | ❌ | ❌ | 每次自增多少   |      |
| startWith      | ❌ | ❌ | ❌ | 从哪里开始自增 |      |
| columnDataType | ✅                            | ✅                            | ❌ | 列的类型       | 必填 |
| catalogName    | ✅                            | ✅                            | ❌ | 目录名         |      |

## addNotNullConstraint

| 属性名           | MySql                        | PostgreSQL                    | Oracle                       | 功能说明 | 备注             |
| ---------------- | ---------------------------- | ---------------------------- | ---------------------------- | -------- | ---------------- |
| tableName        | ✅                            | ✅                            | ✅                            | 表名     |                  |
| columnName       | ✅                            | ✅                            | ✅                            | 列名     |                  |
| constraintName   | ❌ | ❌ | ❌ | 约束名称 | 这个属性会被忽略 |
| columnDataType   | ✅                            | ✅                            | ✅                            | 列类型   | 必填             |
| defaultNullValue | ❌ | ❌ | ❌ | 默认空值 | 这个属性会被忽略 |

## insert & update & delete

| 属性名      | MySql | PostgreSQL | Oracle | 功能说明           | 备注 |
| ----------- | ----- | --------- | ------ | ------------------ | ---- |
| tableName   | ✅     | ✅         | ✅      | 要插入到哪个表     |      |
| dbms        | ✅     | ✅         | ✅      | 指定数据库进行插入 |      |
| catalogName | ✅     | ✅         | ✅      | 目录名             |      |

update使用示例：

```xml
<changeSet id="t13" author="vudsen">
    <createTable tableName="table13">
        <column name="col1" type="${type.int}"/>
        <column name="col2" type="${type.int}"/>
        <column name="col3" type="${type.int}"/>
    </createTable>
    <insert tableName="table13" catalogName="">
        <column name="col1" value="1"/>
        <column name="col2" value="2"/>
        <column name="col3" value="3"/>
    </insert>
    <update tableName="table13">
        <column name="col1" valueComputed="col1 + 1"/>
        <where>col1 = :value AND col3 = :value</where>
        <whereParams>
            <param valueNumeric="1"/>
            <param valueNumeric="3"/>
        </whereParams>
    </update>
    <rollback>
        <dropTable tableName="table13"/>
    </rollback>
</changeSet>
```

`whereParams`中只能在`where`用`:value`来对应，`whereParams`里的`name`没有用处。

推荐参数都在`whereParams`里写，liquibase会自动转换日期等类型（mysql日期可以直接写字符串，oracle需要借助函数）

## dropTable

| 属性名             | MySql                        | PostgreSQL | Oracle | 功能说明                             | 备注 |
| ------------------ | ---------------------------- | --------- | ------ | ------------------------------------ | ---- |
| tableName          | ✅                            | ✅         | ✅      | 表名                                 |      |
| catalogName        | ✅                            | ✅         | ✅      | 目录名                               |      |
| cascadeConstraints | ❌ | ✅         | ✅      | 删除时是否删除指向它的外键所对应的行 |      |

## dropAllForeignKeyConstraints

| 属性名               | MySql | PostgreSQL | Oracle | 功能说明           | 备注 |
| -------------------- | ----- | --------- | ------ | ------------------ | ---- |
| baseTableName        | ✅     | ✅         | ✅      | 要删除哪个表的外键 |      |
| baseTableCatalogName | ✅     | ✅         | ✅      | 目录名             |      |

如果要删除单个外键可以用`dropForeignKeyConstraint`

## dropColumn

| 属性名      | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| ----------- | ----- | --------- | ------ | -------- | ---- |
| tableName   | ✅     | v         | ✅      | 表名     |      |
| columnName  | ✅     | ✅         | ✅      | 列名     |      |
| catalogName | ✅     | ✅         | ✅      | 目录名   |      |

## dropDefaultValue

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| -------------- | ----- | --------- | ------ | -------- | ---- |
| tableName      | ✅     | ✅         | ✅      | 表名     |      |
| columnName     | ✅     | ✅         | ✅      | 列名     |      |
| columnDataType | ✅     | ✅         | ✅      | 列属性   |      |

## dropIndex

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注                                   |
| -------------- | ----- | --------- | ------ | -------- | -------------------------------------- |
| tableName      | ✅     | ✅         | ✅      | 表名     |                                        |
| indexName      | ✅     | ✅         | ✅      | 索引名   |                                        |
| associatedWith | ?     | ?         | ?      |          | 不清楚啥玩意，文档没有，但是代码提示有 |

## dropForeignKeyConstraint

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| -------------- | ----- | --------- | ------ | -------- | ---- |
| baseTableName  | ✅     | ✅         | ✅      | 表名     |      |
| constraintName | ✅     | ✅         | ✅      | 外键名称 |      |

## dropNotNullConstraint

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| -------------- | ----- | --------- | ------ | -------- | ---- |
| tableName      | ✅     | ✅         | ✅      | 表名     |      |
| columnName     | ✅     | ✅         | ✅      | 列名     |      |
| columnDataType | ✅     | ✅         | ✅      | 列类型   | 必填 |

## dropPrimaryKey

所有数据库均可使用，但是在MySQL中无法删除自动增长的主键，PostgreSQL和Oracle可以直接删除。

## dropUniqueConstraint

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| -------------- | ----- | --------- | ------ | -------- | ---- |
| tableName      | ✅     | ✅         | ✅      | 表名     |      |
| constraintName | ✅     | ✅         | ✅      | 约束名   |      |
| uniqueColumns  | ✅     | ✅         | ✅      | 对应的列 |      |

## dropProcedure

未测试

## dropSequence

未测试

## dropView

未测试

## modifyDataType

| 属性名      | MySql | PostgreSQL | Oracle | 功能说明     | 备注 |
| ----------- | ----- | --------- | ------ | ------------ | ---- |
| tableName   | ✅     | ✅         | ✅      | 表名         |      |
| columnName  | ✅     | ✅         | ✅      | 列名         |      |
| newDataType | ✅     | ✅         | ✅      | 新的数据类型 |      |

修改前后的数据类型不同，在不同的数据库可能报错，例如从int -> varchar，mysql和PostgreSQL在有数据的情况下不会报错，而oracle会报错。

但是对于varchar -> varchar，在oracle中即使有数据也不会报错。

## renameColumn

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明     | 备注 |
| -------------- | ----- | --------- | ------ | ------------ | ---- |
| tableName      | ✅     | ✅         | ✅      | 表名         |      |
| oldColumnName  | ✅     | ✅         | ✅      | 旧列名       |      |
| newColumnName  | ✅     | ✅         | ✅      | 新列名       |      |
| columnDataType | ✅     | ✅         | ✅      | 列的数据类型 |      |

## renameTable

| 属性名       | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| ------------ | ----- | --------- | ------ | -------- | ---- |
| oldTableName | ✅     | ✅         | ✅      | 旧表名   |      |
| newTableName | ✅     | ✅         | ✅      | 新表名   |      |

## renameSequence

未测试

## renameView

未测试

## setColumnRemarks

| 属性名         | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| -------------- | ----- | --------- | ------ | -------- | ---- |
| tableName      | ✅     | ✅         | ✅      | 表名     |      |
| columnName     | ✅     | ✅         | ✅      | 列名     |      |
| remarks        | ✅     | ✅         | ✅      | 备注名称 |      |
| columnDataType | ✅     | ✅         | ✅      | 列类型   | 必填 |

## setTableRemarks

| 属性名    | MySql | PostgreSQL | Oracle | 功能说明 | 备注 |
| --------- | ----- | --------- | ------ | -------- | ---- |
| tableName | ✅     | ✅         | ✅      | 表名     |      |
| remarks   | ✅     | ✅         | ✅      | 备注名   |      |

## mergeColumns

合并两个列，**合并后原来的两个列会消失**。

| 属性名          | MySql | PostgreSQL | Oracle | 功能说明         | 备注             |
| --------------- | ----- | --------- | ------ | ---------------- | ---------------- |
| tableName       | ✅     | ✅         | ✅      | 表名             |                  |
| column1Name     | ✅     | ✅         | ✅      | 第一个列名       |                  |
| joinString      | ✅     | ✅         | ✅      | 连接符           |                  |
| column2Name     | ✅     | ✅         | ✅      | 第二个列名       |                  |
| finalColumnName | ✅     | ✅         | ✅      | 最终合并后的列名 |                  |
| finalColumnType | ✅     | ✅         | ✅      | 合并后的类型     | 一般只能是字符串 |

## preConditions

以下标签全可用：

- tableIsEmpty：是否为空表
- tableExists：表是否存在
- columnExists：列是否存在
- primaryKeyExists：主键是否存在
- rowCount：计算有几行
- foreignKeyConstraintExists：外键是否存在
- indexExists：索引是否存在
- uniqueConstraintExists：唯一约束是否存在

未测试：

- viewExists：视图是否存在
