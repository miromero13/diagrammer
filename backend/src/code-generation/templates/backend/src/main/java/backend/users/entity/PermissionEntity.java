package backend.users.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnore;

import backend.common.entity.BaseEntity;

import java.util.HashSet;

@Entity
@Table(name = "permissions")
public class PermissionEntity extends BaseEntity {
    @Column(nullable = false, unique = true)
    public String name;

    @Column(nullable = false)
    public String description;

    @ManyToMany(mappedBy = "permissions")
    @JsonIgnore
    public Set<RoleEntity> roles = new HashSet<>();
}
